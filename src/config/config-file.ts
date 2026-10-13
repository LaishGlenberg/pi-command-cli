import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { CONFIG_FILENAME, CONFIG_PATH_KEY, defaultConfigDir } from "../constants.ts";

/**
 * The on-disk shape of pi-cli's own config file. It is independent of Pi's
 * `settings.json`. `agents` holds saved command strings and `custom` holds the
 * fixtures referenced by `--custom`; unknown keys are preserved on write.
 */
export interface ConfigFile {
  agents?: Record<string, unknown>;
  custom?: unknown;
  [key: string]: unknown;
}

/** The config file and directory currently used by pi-cli. */
export interface ConfigStore {
  path: string;
  directory: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Directory holding pi-cli's config. Uses `$PI_CLI_CONFIG_DIR` first, then
 * `$XDG_CONFIG_HOME` (falling back to `~/.config`), matching the XDG base
 * directory spec.
 */
export function configDir(): string {
  return defaultConfigDir();
}

function storeFromFile(filePath: string): ConfigStore {
  return { path: filePath, directory: dirname(filePath) };
}

function storeFromDirectory(directory: string): ConfigStore {
  return { path: join(directory, CONFIG_FILENAME), directory };
}

/**
 * The config file that holds the default store and the `--path` pointer. This
 * is `$PI_CLI_CONFIG` (an explicit file path), else `<config dir>/config.json`.
 */
export function defaultConfigPath(): string {
  const override = process.env.PI_CLI_CONFIG;
  if (override && override.trim() !== "") return override;
  return join(configDir(), CONFIG_FILENAME);
}

function defaultStore(): ConfigStore {
  return storeFromFile(defaultConfigPath());
}

/** Whether a user-supplied path names a config file rather than a directory. */
function targetIsFile(target: string): boolean {
  return target.replaceAll("\\", "/").endsWith(`/${CONFIG_FILENAME}`);
}

/**
 * Resolve the active config. An explicit target (from `--path`, `--save`, or a
 * test) wins; otherwise the default config's `path` pointer selects another
 * directory, and failing that the default config is used.
 */
export function resolveConfigStore(target?: string): ConfigStore {
  if (target) return targetIsFile(target) ? storeFromFile(target) : storeFromDirectory(target);
  const root = defaultStore();
  if (!existsSync(root.path)) return root;
  const reference = readConfigFile(root.path)[CONFIG_PATH_KEY];
  if (typeof reference !== "string" || reference.trim() === "") return root;
  return storeFromDirectory(resolveConfigReference(reference, root.path));
}

/** Absolute path to the active config file. */
export function configPath(): string {
  return resolveConfigStore().path;
}

export function externalConfigPath(target?: string): string | undefined {
  const store = resolveConfigStore(target);
  return existsSync(store.path) ? store.path : undefined;
}

/** Persist the active config directory in the default config file. */
export function setConfigPath(directory: string): string {
  if (!directory.trim()) throw new Error("config path must not be empty");
  const root = defaultStore();
  const document = readConfigFile(root.path);
  document[CONFIG_PATH_KEY] = resolve(directory);
  writeConfigFile(document, root.path);
  return root.path;
}

/** Read a config file. A missing file reads as an empty config. */
export function readConfigFile(configFilePath?: string): ConfigFile {
  const path = configFilePath || configPath();
  if (!existsSync(path)) return {};

  let config: unknown;
  try {
    config = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`could not read config file ${path}: ${message}`);
  }

  if (!isRecord(config)) {
    throw new Error(`invalid config file: ${path}`);
  }
  return config;
}

export function writeConfigFile(config: ConfigFile, configFilePath?: string): void {
  const path = configFilePath || configPath();
  writeFileAtomic(path, `${JSON.stringify(config, null, 2)}\n`);
}

/**
 * Write a file atomically (temp file + rename) with owner-only permissions,
 * creating parent directories as needed. Shared by the config and alias files.
 */
export function writeFileAtomic(path: string, content: string, mode = 0o600): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, content, { mode });
  renameSync(temporary, path);
  chmodSync(path, mode);
}

export interface InitConfigOptions {
  directory: string;
  filename?: string;
  force?: boolean;
}

export interface InitConfigResult {
  path: string;
  created: boolean;
}

/** Create the per-user config file without overwriting an existing one. */
export function initConfigFile({
  directory,
  filename = CONFIG_FILENAME,
  force = false,
}: InitConfigOptions): InitConfigResult {
  const path = join(directory, filename);
  if (existsSync(path) && !force) return { path, created: false };
  writeConfigFile({}, path);
  return { path, created: true };
}

/** Resolve a relative config path next to the default config file. */
export function resolveConfigReference(reference: string, sourcePath: string): string {
  if (reference.startsWith("~")) return join(process.env.HOME || homedir(), reference.slice(1));
  return isAbsolute(reference) ? reference : resolve(dirname(sourcePath), reference);
}
