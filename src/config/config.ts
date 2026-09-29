import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { parseArguments, shellSplit, type ParsedArguments } from "../cli/arguments.ts";
import {
  CONFIG_FILENAME,
  CONFIG_PATH_KEY,
  defaultConfigDir,
} from "../constants.ts";
import {
  configPath as filePath,
  readConfigFile,
  resolveConfigReference,
  writeConfigFile,
} from "./file.ts";

export interface PiCliSection {
  agents?: Record<string, unknown>;
  custom?: unknown;
  [key: string]: unknown;
}

export type ConfigStoreKind = "file";

/** The config file and directory currently used by pi-cli. */
export interface ConfigStore {
  kind: ConfigStoreKind;
  path: string;
  directory: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validateConfigName(name: string): void {
  if (!name || name === "." || name === ".." || /[\\/\0]/.test(name)) {
    throw new Error("config name must be non-empty and cannot contain path separators");
  }
}

function asStore(pathOrDirectory: string): ConfigStore {
  const isFile = pathOrDirectory.replaceAll("\\\\", "/").endsWith(`/${CONFIG_FILENAME}`);
  const path = isFile ? pathOrDirectory : filePath(pathOrDirectory);
  return { kind: "file", path, directory: isFile ? dirname(path) : pathOrDirectory };
}

function defaultStore(): ConfigStore {
  return asStore(defaultConfigDir());
}

/** Read the default config's path pointer, if one has been configured. */
function configuredDirectory(): string | undefined {
  const root = defaultStore();
  if (!existsSync(root.path)) return undefined;
  const document = readConfigFile(root.path);
  const reference = document[CONFIG_PATH_KEY];
  if (typeof reference !== "string" || reference.trim() === "") return undefined;
  return resolveConfigReference(reference, root.path);
}

/** Resolve the active config. The default config remains the source of truth for the path. */
export function resolveConfigStore(directory?: string): ConfigStore {
  if (directory) return asStore(directory);
  return asStore(configuredDirectory() || defaultConfigDir());
}

export function defaultConfigPath(): string {
  return defaultStore().path;
}

export function externalConfigPath(directory?: string): string | undefined {
  const store = resolveConfigStore(directory);
  return existsSync(store.path) ? store.path : undefined;
}

/** Persist the active config directory in ~/.config/pi-cli/config.json. */
export function setConfigPath(directory: string): string {
  if (!directory.trim()) throw new Error("config path must not be empty");
  const root = defaultStore();
  const document = existsSync(root.path) ? readConfigFile(root.path) : {};
  document[CONFIG_PATH_KEY] = resolve(directory);
  writeConfigFile(root.path, document);
  return root.path;
}

function ensureObject(target: Record<string, unknown>, key: string): Record<string, unknown> {
  const existing = target[key];
  if (isObject(existing)) return existing;
  const created: Record<string, unknown> = {};
  target[key] = created;
  return created;
}

function openStore(store: ConfigStore): {
  section: PiCliSection;
  write: () => void;
} {
  const document = existsSync(store.path) ? readConfigFile(store.path) : {};
  const section = document as PiCliSection;
  return {
    section,
    write: () => {
      writeConfigFile(store.path, document);
    },
  };
}

function savedAgents(section: PiCliSection): Record<string, unknown> {
  const agents: Record<string, unknown> = {};
  if (isObject(section.agents)) Object.assign(agents, section.agents);
  for (const [key, value] of Object.entries(section)) {
    if (key === "agents" || key === "custom" || key === CONFIG_PATH_KEY) continue;
    if (!Object.hasOwn(agents, key)) agents[key] = value;
  }
  return agents;
}

function customFixtures(section: PiCliSection): Record<string, unknown> {
  return isObject(section.custom) ? section.custom : {};
}

function storeFor(configPath?: string): ConfigStore {
  return resolveConfigStore(configPath);
}

export function saveConfig(name: string, command: string, configPath?: string): string {
  validateConfigName(name);
  const store = storeFor(configPath);
  const { section, write } = openStore(store);
  ensureObject(section, "agents")[name] = command;
  write();
  return store.path;
}

export function loadCustomFixtures(configPath?: string): Record<string, unknown> {
  const store = storeFor(configPath);
  if (!existsSync(store.path)) return {};
  return customFixtures(openStore(store).section);
}

export function loadConfig(search: string, configPath?: string): ParsedArguments {
  validateConfigName(search);
  const store = storeFor(configPath);
  if (!existsSync(store.path)) {
    throw new Error(`config file not found: ${store.path}`);
  }
  const section = openStore(store).section;
  const configs = savedAgents(section);
  const names = Object.keys(configs);
  if (names.length === 0) throw new Error(`no saved configs found\nconfig file: ${store.path}`);

  const exact = names.find((name) => name === search);
  const candidates = exact
    ? [exact]
    : names.filter((name) => name.toLowerCase().includes(search.toLowerCase()));
  if (candidates.length === 0) {
    throw new Error(`saved config not found: ${search}\nconfig file: ${store.path}`);
  }
  if (candidates.length > 1) {
    throw new Error(
      `saved config search is ambiguous: ${search}\n` +
        candidates.map((name) => `  ${name}`).join("\n"),
    );
  }

  const candidate = candidates[0];
  if (candidate === undefined || typeof configs[candidate] !== "string") {
    throw new Error(`invalid saved config: ${candidate ?? search}`);
  }
  const tokens = shellSplit(configs[candidate]);
  if (tokens[0] === "pi-cli") tokens.shift();
  const saved = parseArguments(tokens, customFixtures(section));
  saved.importName = candidate;
  return saved;
}
