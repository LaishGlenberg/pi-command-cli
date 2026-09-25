import { BUILTIN_TOOLS, DEFAULT_AGENT_DIR, type BuiltinTool } from "../constants.ts";
import { resolveExtension } from "../resolve/extensions.ts";
import { resolveSkill } from "../resolve/skills.ts";
import { resolveCustomExpression, type CustomFixtures } from "./custom.ts";
import { addBuiltinTools, matchOption } from "./options.ts";

// A runaway guard for `--custom` fixtures that reference themselves.
const MAX_CUSTOM_EXPANSIONS = 1000;

export interface ParsedArguments {
  piArguments: string[];
  useDefaults: boolean;
  hasExtension: boolean;
  hasSkill: boolean;
  builtinTools: BuiltinTool[];
  nothing: boolean;
  saveName?: string | undefined;
  importName?: string | undefined;
  dryRun: boolean;
  help?: boolean | undefined;
  helpi?: boolean | undefined;
}

export type CustomSource = CustomFixtures | (() => CustomFixtures);

export function stripSaveFlag(argv: string[]): string[] {
  const kept: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) continue;
    const option = matchOption(argument);
    if (option?.key !== "save") {
      kept.push(argument);
      continue;
    }
    // Drop the detached `-S name` value too; attached forms carry it inline.
    if (option.inline === undefined) index += 1;
  }
  return kept;
}

export function mergeParsedArguments(
  saved: ParsedArguments,
  current: ParsedArguments,
): ParsedArguments {
  return {
    piArguments: [...saved.piArguments, ...current.piArguments],
    useDefaults: saved.useDefaults && current.useDefaults,
    hasExtension: saved.hasExtension || current.hasExtension,
    hasSkill: saved.hasSkill || current.hasSkill,
    builtinTools: [
      ...new Set([...(saved.builtinTools ?? []), ...(current.builtinTools ?? [])]),
    ],
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
export function shellSplit(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let hasToken = false;
  let quote: string | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const character = input.charAt(index);

    if (quote) {
      if (character === quote) {
        quote = null;
      } else if (quote === '"' && character === "\\" && index + 1 < input.length) {
        index += 1;
        current += input.charAt(index);
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
      current += input.charAt(index);
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

export function parseArguments(
  argv: readonly string[],
  custom: CustomSource = {},
): ParsedArguments {
  const tokens = [...argv];
  const piArguments: string[] = [];
  let parseOptions = true;
  let useDefaults = true;
  const groups = new Set<string>();
  const builtinTools = new Set<BuiltinTool>();
  let saveName: string | undefined;
  let importName: string | undefined;
  let dryRun = false;
  let customExpansions = 0;

  // Fixtures may be passed directly or as a lazy loader, so a plain `--help`
  // run never has to read settings.json.
  let fixtures: CustomFixtures | undefined;
  const getFixtures = (): CustomFixtures => {
    if (fixtures === undefined) {
      fixtures = typeof custom === "function" ? custom() : custom;
    }
    return fixtures;
  };

  const snapshot = (extra: Partial<ParsedArguments> = {}): ParsedArguments => ({
    piArguments,
    useDefaults,
    hasExtension: groups.has("extension"),
    hasSkill: groups.has("skill"),
    builtinTools: [...builtinTools],
    nothing: groups.has("nothing"),
    saveName,
    importName,
    dryRun,
    ...extra,
  });

  // Splice the expanded expression into the token stream in place of the
  // `--custom` wrapper so the result is parsed exactly like typed arguments
  // (an expanded `-e foo` enables extensions and adds `-ne`, and so on).
  const expandCustom = (index: number, removeCount: number, expression: string): void => {
    customExpansions += 1;
    if (customExpansions > MAX_CUSTOM_EXPANSIONS) {
      throw new Error("--custom expanded too many times (possible cycle)");
    }
    tokens.splice(index, removeCount, ...resolveCustomExpression(expression, getFixtures()));
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const argument = tokens[index];
    if (argument === undefined) continue;

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
    const takeValue = (): string => {
      let value = inline;
      if (value === undefined) {
        value = tokens[index + 1];
        if (value === undefined) throw new Error(`${flag} requires ${requires}`);
        index += 1;
      }
      if (value === "") throw new Error(`${flag} requires ${requires}`);
      return value;
    };

    if (key === "help") return snapshot({ help: true });
    if (key === "helpi") return snapshot({ helpi: true });

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

  return snapshot();
}

export function buildPiArguments(
  parsed: ParsedArguments,
  agentDir: string = process.env.PI_AGENT_DIR || DEFAULT_AGENT_DIR,
): string[] {
  if (parsed.help) return [];

  const resolved: string[] = [];
  for (let index = 0; index < parsed.piArguments.length; index += 1) {
    const argument = parsed.piArguments[index];
    if (argument === undefined) continue;

    resolved.push(argument);
    if (argument === "--extension") {
      const value = parsed.piArguments[index + 1];
      if (value === undefined) throw new Error("--extension requires a name or path");
      resolved.push(resolveExtension(value, agentDir));
      index += 1;
    } else if (argument === "--skill") {
      const value = parsed.piArguments[index + 1];
      if (value === undefined) throw new Error("--skill requires a skill name or path");
      resolved.push(resolveSkill(value, agentDir));
      index += 1;
    } else if (argument === "--extension=" || argument === "--skill=") {
      // parseArguments normalizes equals syntax, but keep this guard for
      // callers using buildPiArguments directly.
      throw new Error(`${argument.slice(0, -1)} requires a name or path`);
    }
  }

  const toolFlags: string[] = [];
  if (parsed.builtinTools && parsed.builtinTools.length > 0) {
    const excluded = BUILTIN_TOOLS.filter((name) => !parsed.builtinTools.includes(name));
    if (excluded.length > 0) toolFlags.push("--exclude-tools", excluded.join(","));
  }

  if (!parsed.useDefaults) return [...toolFlags, ...resolved];
  // Naming a resource disables Pi's automatic discovery for that resource
  // type only. With no -e/-s flags, pi-cli is a transparent pass-through to
  // pi and adds no discovery flags of its own.
  const discoveryFlags: string[] = [];
  if (parsed.hasExtension) discoveryFlags.push("-ne");
  if (parsed.hasSkill) discoveryFlags.push("-ns");
  return [...discoveryFlags, ...toolFlags, ...resolved];
}
