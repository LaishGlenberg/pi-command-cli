import { parseArguments, shellSplit, type ParsedArguments } from "../cli/arguments.ts";
import {
  configPath,
  readConfigFile,
  writeConfigFile,
  type ConfigFile,
} from "./config-file.ts";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validateConfigName(name: string): void {
  if (!name || name === "." || name === ".." || /[\\/\0]/.test(name)) {
    throw new Error("config name must be non-empty and cannot contain path separators");
  }
}

export function saveConfig(name: string, command: string, configFilePath?: string): string {
  validateConfigName(name);
  const path = configFilePath || configPath();
  const config = readConfigFile(path);
  const agents = isObject(config.agents) ? config.agents : {};

  agents[name] = command;
  config.agents = agents;

  writeConfigFile(config, path);
  return path;
}

/**
 * Read the saved command strings from the top-level `agents` map.
 */
function savedAgents(config: ConfigFile, path: string): Record<string, unknown> {
  if (!isObject(config.agents)) {
    throw new Error(`no saved configs found\nconfig file: ${path}`);
  }
  return config.agents;
}

/**
 * Read the user-defined `custom` fixtures used by `--custom`. Returns an empty
 * object when the value is missing or is not an object.
 */
function customFixtures(config: ConfigFile): Record<string, unknown> {
  if (!isObject(config.custom)) return {};
  return config.custom;
}

export function loadCustomFixtures(configFilePath?: string): Record<string, unknown> {
  const path = configFilePath || configPath();
  return customFixtures(readConfigFile(path));
}

/** The saved agents and custom fixtures, for `--list`. */
export interface ConfigListing {
  agents: Record<string, unknown>;
  custom: Record<string, unknown>;
}

/**
 * Read the top-level `agents` and `custom` maps without requiring either to be
 * present, so `--list` can print whatever the config file happens to contain.
 */
export function loadConfigListing(configFilePath?: string): ConfigListing {
  const path = configFilePath || configPath();
  const config = readConfigFile(path);
  return {
    agents: isObject(config.agents) ? config.agents : {},
    custom: customFixtures(config),
  };
}

export function loadConfig(search: string, configFilePath?: string): ParsedArguments {
  validateConfigName(search);
  const path = configFilePath || configPath();
  const config = readConfigFile(path);

  const configs = savedAgents(config, path);
  const names = Object.keys(configs);
  if (names.length === 0) {
    throw new Error(`no saved configs found\nconfig file: ${path}`);
  }
  const exact = names.find((name) => name === search);
  const candidates = exact
    ? [exact]
    : names.filter((name) => name.toLowerCase().includes(search.toLowerCase()));

  if (candidates.length === 0) {
    throw new Error(`saved config not found: ${search}\nconfig file: ${path}`);
  }
  if (candidates.length > 1) {
    throw new Error(
      `saved config search is ambiguous: ${search}\n` +
        candidates.map((name) => `  ${name}`).join("\n"),
    );
  }

  const candidate = candidates[0];
  if (candidate === undefined) {
    throw new Error(`saved config not found: ${search}\nconfig file: ${path}`);
  }

  const command = configs[candidate];
  if (typeof command !== "string") {
    throw new Error(`invalid saved config: ${candidate}`);
  }

  // Re-parse the stored command string as fresh argv (skip the leading "pi-cli").
  const tokens = shellSplit(command);
  if (tokens[0] === "pi-cli") tokens.shift();
  const saved = parseArguments(tokens, customFixtures(config));
  saved.importName = candidate;
  return saved;
}
