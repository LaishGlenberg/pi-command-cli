import { existsSync } from "node:fs";

import { PI_CLI_KEY } from "../constants.ts";
import { parseArguments, shellSplit, type ParsedArguments } from "../cli/arguments.ts";
import { readSettings, settingsPath, writeSettings, type Settings } from "./settings.ts";

export interface PiCliSection {
  agents?: Record<string, unknown>;
  custom?: unknown;
  [key: string]: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validateConfigName(name: string): void {
  if (!name || name === "." || name === ".." || /[\\/\0]/.test(name)) {
    throw new Error("config name must be non-empty and cannot contain path separators");
  }
}

function piCliSection(settings: Settings): PiCliSection {
  const existing = settings[PI_CLI_KEY];
  if (!isObject(existing)) {
    settings[PI_CLI_KEY] = {};
  }
  return settings[PI_CLI_KEY] as PiCliSection;
}

export function saveConfig(name: string, command: string, settingsFilePath?: string): string {
  validateConfigName(name);
  const path = settingsFilePath || settingsPath();
  const settings = existsSync(path) ? readSettings(path) : {};
  const piCli = piCliSection(settings);

  if (!isObject(piCli.agents)) {
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
function savedAgents(settings: Settings, path: string): Record<string, unknown> {
  const piCli = settings[PI_CLI_KEY];
  if (!isObject(piCli)) {
    throw new Error(`no saved configs found\nsettings file: ${path}`);
  }

  const agents: Record<string, unknown> = {};
  if (isObject(piCli.agents)) {
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
function customFixtures(settings: Settings): Record<string, unknown> {
  const piCli = settings[PI_CLI_KEY];
  const custom = isObject(piCli) ? piCli.custom : undefined;
  if (!isObject(custom)) return {};
  return custom;
}

export function loadCustomFixtures(settingsFilePath?: string): Record<string, unknown> {
  const path = settingsFilePath || settingsPath();
  if (!existsSync(path)) return {};
  return customFixtures(readSettings(path));
}

export function loadConfig(search: string, settingsFilePath?: string): ParsedArguments {
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

  const candidate = candidates[0];
  if (candidate === undefined) {
    throw new Error(`saved config not found: ${search}\nsettings file: ${path}`);
  }

  const command = configs[candidate];
  if (typeof command !== "string") {
    throw new Error(`invalid saved config: ${candidate}`);
  }

  // Re-parse the stored command string as fresh argv (skip the leading "pi-cli").
  const tokens = shellSplit(command);
  if (tokens[0] === "pi-cli") tokens.shift();
  const saved = parseArguments(tokens, customFixtures(settings));
  saved.importName = candidate;
  return saved;
}
