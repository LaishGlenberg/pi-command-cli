import { BUILTIN_TOOLS, DEFAULT_AGENT_DIR } from "../constants.js";
import { resolveExtension } from "../resolve/extensions.js";
import { resolveSkill } from "../resolve/skills.js";
import { resolveCustomExpression } from "./custom.js";
import { addBuiltinTools, matchOption } from "./options.js";

// A runaway guard for `--custom` fixtures that reference themselves.
const MAX_CUSTOM_EXPANSIONS = 1000;

export function stripSaveFlag(argv) {
  const kept = [];
  for (let index = 0; index < argv.length; index += 1) {
    const option = matchOption(argv[index]);
    if (option?.key !== "save") {
      kept.push(argv[index]);
      continue;
    }
    // Drop the detached `-S name` value too; attached forms carry it inline.
    if (option.inline === undefined) index += 1;
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

/**
 * Split a shell-like command string into argv tokens. Single quotes are
 * literal, double quotes allow backslash escapes, and a backslash escapes the
 * next character outside quotes. This is the inverse of `shellQuote` in
 * `cli/main.js` and lets saved commands contain arguments with spaces (for
 * example a quoted `--custom` expression).
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

export function parseArguments(argv, custom = {}) {
  const tokens = [...argv];
  const piArguments = [];
  let parseOptions = true;
  let useDefaults = true;
  const groups = new Set();
  const builtinTools = new Set();
  let saveName;
  let importName;
  let dryRun = false;
  let customExpansions = 0;

  // Fixtures may be passed directly or as a lazy loader, so a plain `--help`
  // run never has to read settings.json.
  let fixtures;
  const getFixtures = () => {
    if (fixtures === undefined) {
      fixtures = typeof custom === "function" ? custom() : custom;
    }
    return fixtures;
  };

  // Splice the expanded expression into the token stream in place of the
  // `--custom` wrapper so the result is parsed exactly like typed arguments
  // (an expanded `-e foo` enables extensions and adds `-ne`, and so on).
  const expandCustom = (index, removeCount, expression) => {
    customExpansions += 1;
    if (customExpansions > MAX_CUSTOM_EXPANSIONS) {
      throw new Error("--custom expanded too many times (possible cycle)");
    }
    tokens.splice(index, removeCount, ...resolveCustomExpression(expression, getFixtures()));
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const argument = tokens[index];

    if (parseOptions && argument === "--") {
      parseOptions = false;
      piArguments.push(argument);
      continue;
    }

    const option = parseOptions ? matchOption(argument) : undefined;
    if (!option) {
      piArguments.push(argument);
      continue;
    }

    const startIndex = index;
    const { key, flag, requires, inline } = option;
    const takeValue = () => {
      let value = inline;
      if (value === undefined) {
        value = tokens[index + 1];
        if (value === undefined) throw new Error(`${flag} requires ${requires}`);
        index += 1;
      }
      if (value === "") throw new Error(`${flag} requires ${requires}`);
      return value;
    };

    if (key === "help") return { help: true };
    if (key === "helpi") return { helpi: true };

    if (key === "dryRun") {
      dryRun = true;
      continue;
    }

    if (key === "noDefaults") {
      useDefaults = false;
      continue;
    }

    if (key === "nothing") {
      groups.add("nothing");
      useDefaults = false;
      piArguments.push("-ne", "-ns", "-nc", "-np");
      continue;
    }

    if (key === "builtinTools") {
      addBuiltinTools(builtinTools, takeValue(), flag);
      continue;
    }

    if (key === "custom") {
      const expression = takeValue();
      expandCustom(startIndex, inline === undefined ? 2 : 1, expression);
      index = startIndex - 1;
      continue;
    }

    if (key === "extension" || key === "skill") {
      groups.add(key);
      for (const item of takeValue().split(",")) {
        piArguments.push(`--${key}`, item);
      }
      continue;
    }

    if (key === "save") {
      saveName = takeValue();
      continue;
    }

    if (key === "import") {
      importName = takeValue();
    }
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
) {
  if (parsed.help) return [];

  const resolved = [];
  for (let index = 0; index < parsed.piArguments.length; index += 1) {
    const argument = parsed.piArguments[index];

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
