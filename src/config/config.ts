import { existsSync } from "node:fs";

import { PI_CLI_KEY, resolveAgentDir } from "../constants.ts";
import { parseArguments, shellSplit, type ParsedArguments } from "../cli/arguments.ts";
import { configDirectory, findConfigPath, readConfigFile, writeConfigFile } from "./file.ts";
import { readSettings, settingsPath, writeSettings, type Settings } from "./settings.ts";

export interface PiCliSection {
  agents?: Record<string, unknown>;
  custom?: unknown;
  [key: string]: unknown;
}

export type ConfigStoreKind = "file" | "settings";

/** Where pi-cli reads and writes saved configs. */
export interface ConfigStore {
  kind: ConfigStoreKind;
  path: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validateConfigName(name: string): void {
  if (!name || name === "." || name === ".." || /[\\/\0]/.test(name)) {
    throw new Error("config name must be non-empty and cannot contain path separators");
  }
}

function storeLabel(kind: ConfigStoreKind): string {
  return kind === "file" ? "config file" : "settings file";
}

/**
 * Prefer pi-cli's own config file when it exists; otherwise fall back to the
 * `piCli` section in `settings.json`. The presence of the file is what opts the
 * user into the external store, so settings.json stays untouched in that case.
 */
export function resolveConfigStore(agentDir: string = resolveAgentDir()): ConfigStore {
  const file = findConfigPath(configDirectory(agentDir));
  if (file) return { kind: "file", path: file };
  return { kind: "settings", path: settingsPath(agentDir) };
}

export function externalConfigPath(agentDir: string = resolveAgentDir()): string | undefined {
  return findConfigPath(configDirectory(agentDir));
}

function ensureObject(target: Record<string, unknown>, key: string): Record<string, unknown> {
  const existing = target[key];
  if (isObject(existing)) return existing;
  const created: Record<string, unknown> = {};
  target[key] = created;
  return created;
}

interface OpenStore {
  section: PiCliSection;
  write: () => void;
}

/**
 * Open a store for reading and writing. Returns the `piCli`-shaped section plus
 * a `write` callback bound to the right backend, so callers never have to care
 * whether they are editing settings.json or the external file.
 */
function openStore(store: ConfigStore): OpenStore {
  if (store.kind === "settings") {
    const document: Record<string, unknown> = existsSync(store.path)
      ? (readSettings(store.path) as Settings)
      : {};
    const section = ensureObject(document, PI_CLI_KEY) as PiCliSection;
    return { section, write: () => writeSettings(document, store.path) };
  }

  const document = readConfigFile(store.path);
  const nested = document[PI_CLI_KEY];
  // A dedicated file normally holds `agents`/`custom` at the top level, but
  // accepting a nested `piCli` lets users paste the settings.json block as-is.
  const section = isObject(nested) ? (nested as PiCliSection) : (document as PiCliSection);
  return { section, write: () => writeConfigFile(store.path, document) };
}

/**
 * Collect saved commands, preferring the nested `agents` layout and falling
 * back to legacy flat entries so older configs keep working. The reserved
 * `agents` and `custom` keys are skipped.
 */
function savedAgents(section: PiCliSection): Record<string, unknown> {
  const agents: Record<string, unknown> = {};
  if (isObject(section.agents)) {
    Object.assign(agents, section.agents);
  }
  for (const [key, value] of Object.entries(section)) {
    if (key === "agents" || key === "custom") continue;
    if (!Object.hasOwn(agents, key)) agents[key] = value;
  }
  return agents;
}

/**
 * Read the user-defined `custom` fixtures used by `--custom`. Returns an empty
 * object when the value is missing or not an object.
 */
function customFixtures(section: PiCliSection): Record<string, unknown> {
  return isObject(section.custom) ? section.custom : {};
}

function storeFor(settingsFilePath?: string): ConfigStore {
  return settingsFilePath
    ? { kind: "settings", path: settingsFilePath }
    : resolveConfigStore();
}

export function saveConfig(name: string, command: string, settingsFilePath?: string): string {
  validateConfigName(name);
  const store = storeFor(settingsFilePath);
  const { section, write } = openStore(store);

  const agents = ensureObject(section, "agents");
  agents[name] = command;

  write();
  return store.path;
}

export function loadCustomFixtures(settingsFilePath?: string): Record<string, unknown> {
  const store = storeFor(settingsFilePath);
  if (store.kind === "settings" && !existsSync(store.path)) return {};
  const { section } = openStore(store);
  return customFixtures(section);
}

export function loadConfig(search: string, settingsFilePath?: string): ParsedArguments {
  validateConfigName(search);
  const store = storeFor(settingsFilePath);
  const { section } = openStore(store);

  const configs = savedAgents(section);
  const names = Object.keys(configs);
  if (names.length === 0) {
    throw new Error(`no saved configs found\n${storeLabel(store.kind)}: ${store.path}`);
  }
  const exact = names.find((name) => name === search);
  const candidates = exact
    ? [exact]
    : names.filter((name) => name.toLowerCase().includes(search.toLowerCase()));

  if (candidates.length === 0) {
    throw new Error(
      `saved config not found: ${search}\n${storeLabel(store.kind)}: ${store.path}`,
    );
  }
  if (candidates.length > 1) {
    throw new Error(
      `saved config search is ambiguous: ${search}\n` +
        candidates.map((name) => `  ${name}`).join("\n"),
    );
  }

  const candidate = candidates[0];
  if (candidate === undefined) {
    throw new Error(`saved config not found: ${search}\n${storeLabel(store.kind)}: ${store.path}`);
  }

  const command = configs[candidate];
  if (typeof command !== "string") {
    throw new Error(`invalid saved config: ${candidate}`);
  }

  // Re-parse the stored command string as fresh argv (skip the leading "pi-cli").
  const tokens = shellSplit(command);
  if (tokens[0] === "pi-cli") tokens.shift();
  const saved = parseArguments(tokens, customFixtures(section));
  saved.importName = candidate;
  return saved;
}
