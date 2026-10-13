import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { CONFIG_DIR_NAME, CONFIG_FILENAME } from "../constants.ts";

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

/**
 * Directory holding pi-cli's config. Uses `$XDG_CONFIG_HOME` when set, and
 * falls back to `~/.config`, matching the XDG base directory spec.
 */
export function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.trim() !== "" ? xdg : join(homedir(), ".config");
  return join(base, CONFIG_DIR_NAME);
}

/**
 * Absolute path to pi-cli's config file. `$PI_CLI_CONFIG` overrides the whole
 * path (useful for tests and non-standard layouts).
 */
export function configPath(): string {
  return process.env.PI_CLI_CONFIG || join(configDir(), CONFIG_FILENAME);
}

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

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`invalid config file: ${path}`);
  }
  return config as ConfigFile;
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

export function writeConfigFile(config: ConfigFile, configFilePath?: string): void {
  const path = configFilePath || configPath();
  writeFileAtomic(path, `${JSON.stringify(config, null, 2)}\n`);
}
