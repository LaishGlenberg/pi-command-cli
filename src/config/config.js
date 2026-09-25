import { existsSync } from "node:fs";

import { PI_CLI_KEY } from "../constants.js";
import { parseArguments, shellSplit } from "../cli/arguments.js";
import { readSettings, settingsPath, writeSettings } from "./settings.js";

export function validateConfigName(name) {
  if (!name || name === "." || name === ".." || /[\\/\0]/.test(name)) {
    throw new Error("config name must be non-empty and cannot contain path separators");
  }
}

function piCliSection(settings) {
  if (
    !settings[PI_CLI_KEY] ||
    typeof settings[PI_CLI_KEY] !== "object" ||
    Array.isArray(settings[PI_CLI_KEY])
  ) {
    settings[PI_CLI_KEY] = {};
  }
  return settings[PI_CLI_KEY];
}

export function saveConfig(name, command, settingsFilePath) {
  validateConfigName(name);
  const path = settingsFilePath || settingsPath();
  const settings = existsSync(path) ? readSettings(path) : {};
  const piCli = piCliSection(settings);

  if (!piCli.agents || typeof piCli.agents !== "object" || Array.isArray(piCli.agents)) {
    piCli.agents = {};
  }
  piCli.agents[name] = command;

  writeSettings(settings, path);
  return path;
}

/**
 * Collect saved commands, preferring the nested `piCli.agents` layout and
 * falling back to the legacy flat `piCli.<name>` layout so older settings
 * files keep working. The reserved `agents` and `custom` keys are skipped.
 */
function savedAgents(settings, path) {
  const piCli = settings[PI_CLI_KEY];
  if (!piCli || typeof piCli !== "object" || Array.isArray(piCli)) {
    throw new Error(`no saved configs found\nsettings file: ${path}`);
  }

  const agents = {};
  if (piCli.agents && typeof piCli.agents === "object" && !Array.isArray(piCli.agents)) {
    Object.assign(agents, piCli.agents);
  }
  for (const [key, value] of Object.entries(piCli)) {
    if (key === "agents" || key === "custom") continue;
    if (!Object.hasOwn(agents, key)) agents[key] = value;
  }
  return agents;
}

/**
 * Read the user-defined `piCli.custom` fixtures used by `--custom`. Returns an
 * empty object when there is no settings file or the value is not an object.
 */
function customFixtures(settings) {
  const piCli = settings[PI_CLI_KEY];
  const custom = piCli && typeof piCli === "object" ? piCli.custom : undefined;
  if (!custom || typeof custom !== "object" || Array.isArray(custom)) return {};
  return custom;
}

export function loadCustomFixtures(settingsFilePath) {
  const path = settingsFilePath || settingsPath();
  if (!existsSync(path)) return {};
  return customFixtures(readSettings(path));
}

export function loadConfig(search, settingsFilePath) {
  validateConfigName(search);
  const path = settingsFilePath || settingsPath();
  const settings = readSettings(path);

  const configs = savedAgents(settings, path);
  const names = Object.keys(configs);
  if (names.length === 0) {
    throw new Error(`no saved configs found\nsettings file: ${path}`);
  }
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
  const tokens = shellSplit(command);
  if (tokens[0] === "pi-cli") tokens.shift();
  const saved = parseArguments(tokens, customFixtures(settings));
  saved.importName = candidates[0];
  return saved;
}
