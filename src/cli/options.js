import { BUILTIN_TOOLS } from "../constants.js";

// pi-cli's own options are declared once here. FLAG_OPTIONS take no value;
// VALUE_OPTIONS accept a value detached (`--flag value`), after an equals sign
// (`--flag=value`), or attached to a short flag (`-fvalue`). Any argument that
// does not match is forwarded to pi untouched.
const FLAG_OPTIONS = [
  { key: "help", flags: ["-h", "--help"] },
  { key: "helpi", flags: ["-hp", "--helpi"] },
  { key: "nothing", flags: ["-n", "--nothing"] },
  { key: "dryRun", flags: ["--dry-run"] },
  { key: "noDefaults", flags: ["--no-defaults", "--allow-discovery"] },
];

const VALUE_OPTIONS = [
  {
    key: "builtinTools",
    flags: ["-bt", "--built-in-tools"],
    requires: "a comma-separated list of built-in tools",
  },
  { key: "custom", flags: ["-cu", "--custom"], requires: "a value" },
  { key: "extension", flags: ["-e", "--extension"], requires: "an extension name or path" },
  { key: "skill", flags: ["-s", "--skill"], requires: "a skill name or path" },
  { key: "save", flags: ["-S", "--save"], requires: "a config name" },
  { key: "import", flags: ["-i", "--import"], requires: "a config name" },
];

/**
 * Match a single argv element against pi-cli's options. Returns the canonical
 * key, the spelling that was used (for error messages), and the inline value
 * when the value was attached to the flag. Returns `undefined` for anything
 * that should pass through to pi.
 */
export function matchOption(argument) {
  for (const option of FLAG_OPTIONS) {
    if (option.flags.includes(argument)) {
      return { key: option.key, flag: argument, requires: undefined, inline: undefined };
    }
  }

  for (const option of VALUE_OPTIONS) {
    for (const flag of option.flags) {
      if (argument === flag) {
        return { key: option.key, flag, requires: option.requires, inline: undefined };
      }
      if (flag.startsWith("--")) {
        if (argument.startsWith(`${flag}=`)) {
          return {
            key: option.key,
            flag,
            requires: option.requires,
            inline: argument.slice(flag.length + 1),
          };
        }
      } else if (argument.startsWith(flag) && argument.length > flag.length) {
        let inline = argument.slice(flag.length);
        if (inline.startsWith("=")) inline = inline.slice(1);
        return { key: option.key, flag, requires: option.requires, inline };
      }
    }
  }

  return undefined;
}

export function addBuiltinTools(builtinTools, requested, flag) {
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
