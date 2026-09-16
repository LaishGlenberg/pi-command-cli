#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, resolve } from "node:path";
import { homedir } from "node:os";

const DEFAULT_AGENT_DIR = join(homedir(), ".pi", "agent");
const SETTINGS_FILENAME = "settings.json";
const PI_CLI_KEY = "piCli";
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git"]);

/**
 * Walk a directory without following dependency trees or git metadata.
 * `maxDepth` is measured from `root` (root itself is depth zero).
 */
function* walkEntries(root, { maxDepth = Infinity, skipDirectories = SKIPPED_DIRECTORIES } = {}) {
  const visited = new Set();

  function* visit(directory, depth) {
    let realDirectory;
    try {
      realDirectory = realpathSync(directory);
    } catch {
      return;
    }

    if (visited.has(realDirectory)) return;
    visited.add(realDirectory);

    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const path = join(directory, entry.name);
      let isDirectory = entry.isDirectory();

      // npm installations made with links (for example pnpm) still need to
      // be discoverable, but broken links should simply be ignored.
      if (entry.isSymbolicLink()) {
        try {
          isDirectory = statSync(path).isDirectory();
        } catch {
          continue;
        }
      }

      const entryDepth = depth + 1;
      yield { path, name: entry.name, isDirectory, depth: entryDepth };

      if (
        isDirectory &&
        entryDepth < maxDepth &&
        !skipDirectories.has(entry.name)
      ) {
        yield* visit(path, entryDepth);
      }
    }
  }

  if (existsSync(root)) yield* visit(root, 0);
}

function readPackageJson(directory) {
  const packagePath = join(directory, "package.json");
  try {
    return JSON.parse(readFileSync(packagePath, "utf8"));
  } catch {
    return undefined;
  }
}

function isPiPackage(packageJson) {
  return Boolean(packageJson && packageJson.pi);
}

function hasExtensionSource(directory) {
  for (const entry of walkEntries(directory)) {
    if (!entry.isDirectory && SOURCE_EXTENSIONS.has(extname(entry.name))) {
      return true;
    }
  }
  return false;
}

function looksLikeExtensionDirectory(directory) {
  const packageJson = readPackageJson(directory);
  return isPiPackage(packageJson) || hasExtensionSource(directory);
}

function packageNameMatches(packageJson, requested) {
  if (!packageJson || typeof packageJson.name !== "string") return false;
  return packageJson.name === requested || packageJson.name.split("/").pop() === requested;
}

function canonicalPath(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function addMatch(matches, path) {
  const candidate = canonicalPath(path);
  if (!matches.includes(candidate)) matches.push(candidate);
}

function sourceNameMatches(filename, requested) {
  return (
    filename === requested ||
    [...SOURCE_EXTENSIONS].some((extension) => filename === `${requested}${extension}`)
  );
}

function skillFileNameMatches(filename, requested) {
  return filename === requested || filename === `${requested}.md`;
}

function hasSkillFile(directory) {
  const skillPath = join(directory, "SKILL.md");
  try {
    return statSync(skillPath).isFile();
  } catch {
    return false;
  }
}

function addSkillMatch(matches, path) {
  if (hasSkillFile(path)) addMatch(matches, path);
}

/**
 * Resolve an extension name to the path Pi expects.
 *
 * Search order is npm packages, git checkouts, then local extensions. Package
 * metadata is used for scoped packages and repositories whose folder name is
 * different from their package name.
 */
export function resolveExtension(requested, agentDir = process.env.PI_AGENT_DIR || DEFAULT_AGENT_DIR) {
  if (!requested) {
    throw new Error("--extension requires an extension name or path");
  }

  // Explicit paths remain valid, including paths outside ~/.pi/agent.
  if (existsSync(requested)) return requested;

  const roots = [
    { path: join(agentDir, "npm", "node_modules"), kind: "npm" },
    { path: join(agentDir, "git"), kind: "git" },
    { path: join(agentDir, "extensions"), kind: "extensions" },
  ];
  const matches = [];

  for (const root of roots) {
    if (!existsSync(root.path)) continue;

    if (root.kind === "npm") {
      // Package roots are at depth one, or depth two for scoped packages.
      for (const entry of walkEntries(root.path, { maxDepth: 2, skipDirectories: new Set() })) {
        if (
          entry.isDirectory &&
          entry.name === requested &&
          looksLikeExtensionDirectory(entry.path)
        ) {
          addMatch(matches, entry.path);
        }
      }
    } else {
      // Git and local extension folders may be nested. Source files are also
      // valid -- e.g. extensions/orca-prefill.ts.
      for (const entry of walkEntries(root.path)) {
        if (entry.isDirectory) {
          if (entry.name === requested && looksLikeExtensionDirectory(entry.path)) {
            addMatch(matches, entry.path);
          }
        } else if (sourceNameMatches(entry.name, requested)) {
          addMatch(matches, entry.path);
        }
      }
    }

    // A package's directory name is not always its package name (especially
    // for scoped npm packages and extensions checked out from git).
    const packageDepth = root.kind === "npm" ? 3 : Infinity;
    for (const entry of walkEntries(root.path, { maxDepth: packageDepth })) {
      if (entry.isDirectory || entry.name !== "package.json") continue;
      const packageJson = readPackageJson(resolve(entry.path, ".."));
      if (packageNameMatches(packageJson, requested) && isPiPackage(packageJson)) {
        addMatch(matches, resolve(entry.path, ".."));
      }
    }
  }

  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new Error(
      `extension not found: ${requested}\n` +
        `searched ${agentDir}/npm/node_modules, ${agentDir}/git, and ${agentDir}/extensions`,
    );
  }

  throw new Error(
    `extension name is ambiguous: ${requested}\n` +
      matches.map((match) => `  ${match}`).join("\n") +
      "\nuse an explicit extension path to disambiguate",
  );
}

/**
 * Resolve a skill name to a file or skill directory accepted by Pi.
 * Global skills are searched first, followed by skills shipped alongside
 * extensions in npm, git, and the local extensions directory.
 */
export function resolveSkill(requested, agentDir = process.env.PI_AGENT_DIR || DEFAULT_AGENT_DIR) {
  if (!requested) {
    throw new Error("--skill requires a skill name or path");
  }

  // Explicit files and directories remain valid, including paths outside the
  // agent directory.
  if (existsSync(requested)) return requested;

  const matches = [];
  const globalSkills = join(agentDir, "skills");

  if (existsSync(globalSkills)) {
    for (const entry of walkEntries(globalSkills)) {
      if (entry.isDirectory) {
        if (entry.name === requested) addSkillMatch(matches, entry.path);
      } else if (skillFileNameMatches(entry.name, requested)) {
        addMatch(matches, entry.path);
      }
    }
  }

  const extensionRoots = [
    join(agentDir, "npm", "node_modules"),
    join(agentDir, "git"),
    join(agentDir, "extensions"),
  ];

  for (const root of extensionRoots) {
    if (!existsSync(root)) continue;

    // SKILL.md is the marker for a skill directory, so scanning extension
    // trees does not mistake an ordinary source directory for a skill.
    for (const entry of walkEntries(root)) {
      if (entry.isDirectory) {
        if (entry.name === requested) addSkillMatch(matches, entry.path);
      } else if (skillFileNameMatches(entry.name, requested)) {
        addMatch(matches, entry.path);
      }
    }
  }

  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new Error(
      `skill not found: ${requested}\n` +
        `searched ${agentDir}/skills and skills inside ${agentDir}/npm/node_modules, ${agentDir}/git, and ${agentDir}/extensions`,
    );
  }

  throw new Error(
    `skill name is ambiguous: ${requested}\n` +
      matches.map((match) => `  ${match}`).join("\n") +
      "\nuse an explicit skill path to disambiguate",
  );
}

function settingsPath() {
  return join(process.env.PI_AGENT_DIR || DEFAULT_AGENT_DIR, SETTINGS_FILENAME);
}

function readSettings(settingsFilePath) {
  const path = settingsFilePath || settingsPath();
  if (!existsSync(path)) return {};

  let settings;
  try {
    settings = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`could not read settings file ${path}: ${error.message}`);
  }

  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    throw new Error(`invalid settings file: ${path}`);
  }
  return settings;
}

function writeSettings(settings, settingsFilePath) {
  const path = settingsFilePath || settingsPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
  chmodSync(path, 0o600);
}

function validateConfigName(name) {
  if (!name || name === "." || name === ".." || /[\\/\0]/.test(name)) {
    throw new Error("config name must be non-empty and cannot contain path separators");
  }
}

function stripSaveFlag(argv) {
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

export function saveConfig(name, command, settingsFilePath) {
  validateConfigName(name);
  const path = settingsFilePath || settingsPath();
  const settings = existsSync(path) ? readSettings(path) : {};

  if (!settings[PI_CLI_KEY] || typeof settings[PI_CLI_KEY] !== "object" || Array.isArray(settings[PI_CLI_KEY])) {
    settings[PI_CLI_KEY] = {};
  }
  settings[PI_CLI_KEY][name] = command;

  writeSettings(settings, path);
  return path;
}

export function loadConfig(search, settingsFilePath) {
  validateConfigName(search);
  const path = settingsFilePath || settingsPath();
  const settings = readSettings(path);

  const configs = settings[PI_CLI_KEY];
  if (!configs || typeof configs !== "object" || Array.isArray(configs)) {
    throw new Error(`no saved configs found\nsettings file: ${path}`);
  }

  const names = Object.keys(configs);
  const exact = names.find((name) => name === search);
  const candidates = exact
    ? [exact]
    : names.filter((name) => name.toLowerCase().includes(search.toLowerCase()));

  if (candidates.length === 0) {
    throw new Error(`saved config not found: ${search}\nsettings file: ${path}`);
  }
  if (candidates.length > 1) {
    throw new Error(
      `saved config search is ambiguous: ${search}\n` +
        candidates.map((name) => `  ${name}`).join("\n"),
    );
  }

  const command = configs[candidates[0]];
  if (typeof command !== "string") {
    throw new Error(`invalid saved config: ${candidates[0]}`);
  }

  // Re-parse the stored command string as fresh argv (skip the leading "pi-cli").
  const tokens = command.split(/\s+/);
  if (tokens[0] === "pi-cli") tokens.shift();
  const saved = parseArguments(tokens);
  saved.importName = candidates[0];
  return saved;
}

function mergeParsedArguments(saved, current) {
  return {
    piArguments: [...saved.piArguments, ...current.piArguments],
    useDefaults: saved.useDefaults && current.useDefaults,
    hasExtension: saved.hasExtension || current.hasExtension,
    hasSkill: saved.hasSkill || current.hasSkill,
    hasTools: saved.hasTools || current.hasTools,
    nothing: saved.nothing || current.nothing,
    dryRun: saved.dryRun || current.dryRun,
  };
}

export function parseArguments(argv) {
  const piArguments = [];
  let parseOptions = true;
  let useDefaults = true;
  const groups = new Set();
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

    if (parseOptions && (argument === "--nothing" || argument === "-n")) {
      groups.add("nothing");
      useDefaults = false;
      piArguments.push("-ne", "-ns", "-nc", "-np", "-nbt");
      groups.add("nbt");
      continue;
    }

    if (parseOptions && argument === "--dry-run") {
      dryRun = true;
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

    if (parseOptions && (argument === "--tools" || argument === "-t")) {
      groups.add("tools");
      if (!groups.has("nbt")) {
        groups.add("nbt");
        piArguments.push("-nbt");
      }
      const requested = argv[index + 1];
      if (requested === undefined) {
        throw new Error(`${argument} requires a tool allowlist`);
      }
      piArguments.push("--tools", requested);
      index += 1;
      continue;
    }

    if (parseOptions && argument.startsWith("--tools=")) {
      groups.add("tools");
      if (!groups.has("nbt")) {
        groups.add("nbt");
        piArguments.push("-nbt");
      }
      const requested = argument.slice("--tools=".length);
      if (!requested) throw new Error("--tools requires a tool allowlist");
      piArguments.push("--tools", requested);
      continue;
    }

    if (parseOptions && argument.startsWith("-t") && argument.length > 2) {
      groups.add("tools");
      if (!groups.has("nbt")) {
        groups.add("nbt");
        piArguments.push("-nbt");
      }
      piArguments.push("--tools", argument.slice(2));
      continue;
    }

    piArguments.push(argument);
  }

  return {
    piArguments,
    useDefaults,
    hasExtension: groups.has("extension"),
    hasSkill: groups.has("skill"),
    hasTools: groups.has("tools"),
    nothing: groups.has("nothing"),
    saveName,
    importName,
    dryRun,
  };
}

export function buildPiArguments(parsed, agentDir = process.env.PI_AGENT_DIR || DEFAULT_AGENT_DIR) {
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

  if (!parsed.useDefaults) return resolved;
  // An explicit -e/-s disables discovery for that resource type only. When
  // neither is given, fall back to a fully isolated run (no discovery at all).
  const discoveryFlags = [];
  if (parsed.hasSkill || !parsed.hasExtension) discoveryFlags.push("-ns");
  if (parsed.hasExtension || !parsed.hasSkill) discoveryFlags.push("-ne");
  return [...discoveryFlags, ...resolved];
}

function shellQuote(argument) {
  if (/^[a-zA-Z0-9_./:@%+=,-]+$/.test(argument)) return argument;
  return `'${argument.replaceAll("'", "'\\''")}'`;
}

function printHelp() {
  process.stdout.write(`Usage: pi-cli [options] [pi-options/messages...]\n\n`);
  process.stdout.write(`Runs pi with explicit resources and passes normal Pi arguments through.\n`);
  process.stdout.write(`It adds -ne when extensions are named and -ns when skills are named.\n\n`);
  process.stdout.write(`Options:\n`);
  process.stdout.write(`  -e, --extension <name|path>  Load an extension (repeatable)\n`);
  process.stdout.write(`  -s, --skill <name|path>      Load a skill (repeatable)\n`);
  process.stdout.write(`  -t, --tools <tools>          Comma-separated tool allowlist (implies -nbt)\n`);
  process.stdout.write(`  -i, --import <search>        Load a saved configuration\n`);
  process.stdout.write(`  -S, --save <name>            Save this configuration and exit\n`);
  process.stdout.write(`  --no-defaults                Do not add default discovery flags\n`);
  process.stdout.write(`  --allow-discovery            Alias for --no-defaults\n`);
  process.stdout.write(`  -n, --nothing                Equivalent to "-ne -ns -nc -np"\n`);
  process.stdout.write(`  --dry-run                    Print the command without running pi\n`);
  process.stdout.write(`  -h, --help                   Show this help\n\n`);
  process.stdout.write(`Extension and skill search roots:\n`);
  process.stdout.write(`  $PI_AGENT_DIR/npm/node_modules (or ~/.pi/agent)\n`);
  process.stdout.write(`  $PI_AGENT_DIR/git\n`);
  process.stdout.write(`  $PI_AGENT_DIR/extensions\n`);
}

export function main(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArguments(argv);
    if (parsed.help) {
      printHelp();
      return 0;
    }

    if (parsed.saveName && parsed.importName) {
      throw new Error("--save and --import cannot be used together");
    }

    if (parsed.saveName) {
      // Validate resource names now so a typo in an extension/skill name
      // fails before we write anything.
      buildPiArguments(parsed);
      const tokens = stripSaveFlag(argv);
      const command = ["pi-cli", ...tokens.map(shellQuote)].join(" ");
      const destination = saveConfig(parsed.saveName, command);
      process.stdout.write(`saved config "${parsed.saveName}" to ${destination}\n`);
      return 0;
    }

    if (parsed.importName) {
      const saved = loadConfig(parsed.importName);
      parsed = mergeParsedArguments(saved, parsed);
    }

    const piArguments = buildPiArguments(parsed);
    const piCommand = process.env.PI_BIN || "pi";

    if (parsed.dryRun) {
      process.stdout.write([piCommand, ...piArguments].map(shellQuote).join(" ") + "\n");
      return 0;
    }

    const child = spawn(piCommand, piArguments, { stdio: "inherit" });
    child.on("error", (error) => {
      process.stderr.write(`pi-cli: unable to run ${piCommand}: ${error.message}\n`);
      process.exitCode = 127;
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        process.exitCode = 128;
      } else {
        process.exitCode = code ?? 1;
      }
    });
    return undefined;
  } catch (error) {
    process.stderr.write(`pi-cli: ${error.message}\n`);
    return 1;
  }
}

let invokedPath = "";
if (process.argv[1]) {
  try {
    invokedPath = realpathSync(process.argv[1]);
  } catch {
    // Importing the module from a non-file entry point should not execute it.
  }
}
const modulePath = fileURLToPath(import.meta.url);
if (invokedPath === modulePath) {
  const result = main();
  if (result !== undefined) process.exitCode = result;
}

export { DEFAULT_AGENT_DIR };
