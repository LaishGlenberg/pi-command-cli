import { existsSync } from "node:fs";

import { PI_CLI_KEY } from "./constants.js";
import { parseArguments } from "./arguments.js";
import { readSettings, settingsPath, writeSettings } from "./settings.js";

export function validateConfigName(name) {
  if (!name || name === "." || name === ".." || /[\\/\0]/.test(name)) {
    throw new Error("config name must be non-empty and cannot contain path separators");
  }
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
