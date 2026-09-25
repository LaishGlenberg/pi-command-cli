import { BUILTIN_TOOLS, DEFAULT_AGENT_DIR } from "./constants.js";
import { resolveExtension } from "./extensions.js";
import { resolveSkill } from "./skills.js";

export function stripSaveFlag(argv) {
  const kept = [];
  let index = 0;
  while (index < argv.length) {
    const argument = argv[index];
    if (argument === "--save" || argument === "-S") {
      index += 2;
      continue;
    }
    if (argument.startsWith("--save=")) {
      index += 1;
      continue;
    }
    if (argument.startsWith("-S") && argument.length > 2) {
      index += 1;
      continue;
    }
    kept.push(argument);
    index += 1;
  }
  return kept;
}

export function mergeParsedArguments(saved, current) {
  return {
    piArguments: [...saved.piArguments, ...current.piArguments],
    useDefaults: saved.useDefaults && current.useDefaults,
    hasExtension: saved.hasExtension || current.hasExtension,
    hasSkill: saved.hasSkill || current.hasSkill,
    builtinTools: [...new Set([...(saved.builtinTools ?? []), ...(current.builtinTools ?? [])])],
    nothing: saved.nothing || current.nothing,
    dryRun: saved.dryRun || current.dryRun,
  };
}

function addBuiltinTools(builtinTools, requested, flag) {
  const names = requested
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  if (names.length === 0) {
    throw new Error(`${flag} requires a comma-separated list of built-in tools`);
  }
  for (const name of names) {
    if (!BUILTIN_TOOLS.includes(name)) {
      throw new Error(`unknown built-in tool: ${name}\nvalid tools: ${BUILTIN_TOOLS.join(", ")}`);
    }
    builtinTools.add(name);
  }
}

/**
 * Split a shell-like command string into argv tokens. Single quotes are
 * literal, double quotes allow backslash escapes, and a backslash escapes the
 * next character outside quotes. This is the inverse of `shellQuote` in cli.js
 * and lets saved commands contain arguments with spaces (for example a
 * quoted `--custom` expression).
 */
export function shellSplit(input) {
  const tokens = [];
  let current = "";
  let hasToken = false;
  let quote = null;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (quote) {
      if (character === quote) {
        quote = null;
      } else if (quote === '"' && character === "\\" && index + 1 < input.length) {
        index += 1;
        current += input[index];
      } else {
        current += character;
      }
      hasToken = true;
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      hasToken = true;
      continue;
    }

    if (/\s/.test(character)) {
      if (hasToken) {
        tokens.push(current);
        current = "";
        hasToken = false;
      }
      continue;
    }

    if (character === "\\" && index + 1 < input.length) {
      index += 1;
      current += input[index];
      hasToken = true;
      continue;
    }

    current += character;
    hasToken = true;
  }

  if (quote) throw new Error("unterminated quote in command");
  if (hasToken) tokens.push(current);
  return tokens;
}

/**
 * Parse a JavaScript-style access path such as `sys_prompts[0]` or
 * `config.options.deep` into segments. Returns `null` when the token is not a
 * valid access path, which lets callers treat it as a literal argument.
 */
function parseAccessPath(path) {
  const head = /^[A-Za-z_$][\w$]*/.exec(path);
  if (!head) return null;

  const segments = [head[0]];
  let rest = path.slice(head[0].length);

  while (rest.length > 0) {
    if (rest.startsWith(".")) {
      const match = /^\.([A-Za-z_$][\w$]*)/.exec(rest);
      if (!match) return null;
      segments.push(match[1]);
      rest = rest.slice(match[0].length);
      continue;
    }

    if (rest.startsWith("[")) {
      const end = rest.indexOf("]");
      if (end === -1) return null;
      const inner = rest.slice(1, end).trim();
      if (/^\d+$/.test(inner)) {
        segments.push(Number(inner));
      } else if (/^(["']).*\1$/.test(inner)) {
        segments.push(inner.slice(1, -1));
      } else {
        return null;
      }
      rest = rest.slice(end + 1);
      continue;
    }

    return null;
  }

  return segments;
}

function lookupCustom(custom, token) {
  const segments = parseAccessPath(token);
  if (!segments) return { found: false };

  let value = custom;
  for (const segment of segments) {
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, segment)) {
      return { found: false };
    }
    value = value[segment];
  }
  return { found: true, value };
}

function serializeCustomValue(value) {
  if (typeof value === "string") return value;
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function customValueToArguments(value) {
  if (Array.isArray(value)) return value.map(serializeCustomValue);
  return [serializeCustomValue(value)];
}

/**
 * Expand a `--custom` expression against the user's `piCli.custom` fixtures.
 * The expression is a small argument list where one token is an access path
 * such as `sys_prompts[0]`; that token is replaced by the referenced value.
 * Strings pass through, arrays spread into separate arguments, and other
 * values are JSON-serialized.
 */
export function resolveCustomExpression(expression, custom = {}) {
  if (typeof expression !== "string" || expression.trim() === "") {
    throw new Error("--custom requires a value");
  }

  const resolved = [];
  let references = 0;

  // The shell already stripped the outer quotes, so the expression is a single
  // argv element. Split on whitespace without re-interpreting inner quotes;
  // bracket-quoted access keys like `obj['prompt']` are part of the path.
  for (const token of expression.trim().split(/\s+/)) {
    const lookup = lookupCustom(custom, token);
    if (!lookup.found) {
      resolved.push(token);
      continue;
    }
    references += 1;
    if (references > 1) {
      throw new Error(`ambiguous custom reference: ${expression}`);
    }
    resolved.push(...customValueToArguments(lookup.value));
  }

  if (references === 0) {
    throw new Error(`custom fixture not found: ${expression}`);
  }
  return resolved;
}

export function parseArguments(argv) {
  const piArguments = [];
  let parseOptions = true;
  let useDefaults = true;
  const groups = new Set();
  const builtinTools = new Set();
  let saveName;
  let importName;
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (parseOptions && argument === "--") {
      parseOptions = false;
      piArguments.push(argument);
      continue;
    }

    if (parseOptions && (argument === "--help" || argument === "-h")) {
      return { help: true };
    }

    if (parseOptions && (argument === "--helpi" || argument === "-hp")) {
      return { helpi: true };
    }

    if (parseOptions && (argument === "--nothing" || argument === "-n")) {
      groups.add("nothing");
      useDefaults = false;
      piArguments.push("-ne", "-ns", "-nc", "-np");
      continue;
    }

    if (parseOptions && argument === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (parseOptions && (argument === "--built-in-tools" || argument === "-bt")) {
      const requested = argv[index + 1];
      if (requested === undefined) {
        throw new Error(`${argument} requires a comma-separated list of built-in tools`);
      }
      addBuiltinTools(builtinTools, requested, argument);
      index += 1;
      continue;
    }

    if (parseOptions && argument.startsWith("--built-in-tools=")) {
      addBuiltinTools(builtinTools, argument.slice("--built-in-tools=".length), "--built-in-tools");
      continue;
    }

    if (parseOptions && argument.startsWith("-bt") && argument.length > 3) {
      const requested = argument.startsWith("-bt=") ? argument.slice(4) : argument.slice(3);
      addBuiltinTools(builtinTools, requested, "-bt");
      continue;
    }

    if (parseOptions && (argument === "--save" || argument === "--import" || argument === "-i" || argument === "-S")) {
      const name = argv[index + 1];
      if (name === undefined) {
        throw new Error(`${argument} requires a config name`);
      }
      if (argument === "--save" || argument === "-S") saveName = name;
      else importName = name;
      index += 1;
      continue;
    }

    if (parseOptions && (argument.startsWith("--save=") || argument.startsWith("--import="))) {
      const [option, name] = argument.split("=", 2);
      if (!name) throw new Error(`${option} requires a config name`);
      if (option === "--save") saveName = name;
      else importName = name;
      continue;
    }

    if (parseOptions && argument.startsWith("-i") && argument.length > 2) {
      importName = argument.slice(2);
      continue;
    }

    if (parseOptions && argument.startsWith("-S") && argument.length > 2) {
      saveName = argument.slice(2);
      continue;
    }

    if (parseOptions && (argument === "--no-defaults" || argument === "--allow-discovery")) {
      useDefaults = false;
      continue;
    }

    if (parseOptions && (argument === "--custom" || argument === "-cu")) {
      const expression = argv[index + 1];
      if (expression === undefined) {
        throw new Error(`${argument} requires a value`);
      }
      piArguments.push("--custom", expression);
      index += 1;
      continue;
    }

    if (parseOptions && argument.startsWith("--custom=")) {
      const expression = argument.slice("--custom=".length);
      if (!expression) throw new Error("--custom requires a value");
      piArguments.push("--custom", expression);
      continue;
    }

    if (parseOptions && argument.startsWith("-cu") && argument.length > 3) {
      const expression = argument.startsWith("-cu=") ? argument.slice(4) : argument.slice(3);
      if (!expression) throw new Error("-cu requires a value");
      piArguments.push("--custom", expression);
      continue;
    }

    if (parseOptions && (argument === "--extension" || argument === "-e")) {
      groups.add("extension");
      const requested = argv[index + 1];
      if (requested === undefined) {
        throw new Error(`${argument} requires an extension name or path`);
      }
      for (const item of requested.split(",")) {
        piArguments.push("--extension", item);
      }
      index += 1;
      continue;
    }

    if (parseOptions && argument.startsWith("--extension=")) {
      groups.add("extension");
      const requested = argument.slice("--extension=".length);
      if (!requested) throw new Error("--extension requires an extension name or path");
      for (const item of requested.split(",")) {
        piArguments.push("--extension", item);
      }
      continue;
    }

    if (parseOptions && argument.startsWith("-e") && argument.length > 2) {
      groups.add("extension");
      for (const item of argument.slice(2).split(",")) {
        piArguments.push("--extension", item);
      }
      continue;
    }

    if (parseOptions && (argument === "--skill" || argument === "-s")) {
      groups.add("skill");
      const requested = argv[index + 1];
      if (requested === undefined) {
        throw new Error(`${argument} requires a skill name or path`);
      }
      for (const item of requested.split(",")) {
        piArguments.push("--skill", item);
      }
      index += 1;
      continue;
    }

    if (parseOptions && argument.startsWith("--skill=")) {
      groups.add("skill");
      const requested = argument.slice("--skill=".length);
      if (!requested) throw new Error("--skill requires a skill name or path");
      for (const item of requested.split(",")) {
        piArguments.push("--skill", item);
      }
      continue;
    }

    if (parseOptions && argument.startsWith("-s") && argument.length > 2) {
      groups.add("skill");
      for (const item of argument.slice(2).split(",")) {
        piArguments.push("--skill", item);
      }
      continue;
    }

    piArguments.push(argument);
  }

  return {
    piArguments,
    useDefaults,
    hasExtension: groups.has("extension"),
    hasSkill: groups.has("skill"),
    builtinTools: [...builtinTools],
    nothing: groups.has("nothing"),
    saveName,
    importName,
    dryRun,
  };
}

export function buildPiArguments(
  parsed,
  agentDir = process.env.PI_AGENT_DIR || DEFAULT_AGENT_DIR,
  custom = {},
) {
  if (parsed.help) return [];

  const resolved = [];
  for (let index = 0; index < parsed.piArguments.length; index += 1) {
    const argument = parsed.piArguments[index];

    if (argument === "--custom") {
      const expression = parsed.piArguments[index + 1];
      if (expression === undefined) {
        throw new Error("--custom requires a value");
      }
      resolved.push(...resolveCustomExpression(expression, custom));
      index += 1;
      continue;
    }

    resolved.push(argument);
    if (argument === "--extension") {
      resolved.push(resolveExtension(parsed.piArguments[index + 1], agentDir));
      index += 1;
    } else if (argument === "--skill") {
      resolved.push(resolveSkill(parsed.piArguments[index + 1], agentDir));
      index += 1;
    } else if (argument === "--extension=" || argument === "--skill=") {
      // parseArguments normalizes equals syntax, but keep this guard for
      // callers using buildPiArguments directly.
      throw new Error(`${argument.slice(0, -1)} requires a name or path`);
    }
  }

  const toolFlags = [];
  if (parsed.builtinTools && parsed.builtinTools.length > 0) {
    const excluded = BUILTIN_TOOLS.filter((name) => !parsed.builtinTools.includes(name));
    if (excluded.length > 0) toolFlags.push("--exclude-tools", excluded.join(","));
  }

  if (!parsed.useDefaults) return [...toolFlags, ...resolved];
  // Naming a resource disables Pi's automatic discovery for that resource
  // type only. With no -e/-s flags, pi-cli is a transparent pass-through to
  // pi and adds no discovery flags of its own.
  const discoveryFlags = [];
  if (parsed.hasExtension) discoveryFlags.push("-ne");
  if (parsed.hasSkill) discoveryFlags.push("-ns");
  return [...discoveryFlags, ...toolFlags, ...resolved];
}
