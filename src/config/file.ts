import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";

import { atomicWriteFile } from "./io.ts";
import { CONFIG_FILENAME, defaultConfigDir } from "../constants.ts";

/** The single config file name used by pi-cli. */
export const DEFAULT_CONFIG_FILENAME = CONFIG_FILENAME;
export const CONFIG_DIRECTORY_NAME = "pi-cli";
export const CONFIG_FILENAMES = [CONFIG_FILENAME] as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Return pi-cli's default per-user configuration directory. */
export function configDirectory(directory = defaultConfigDir()): string {
  return directory;
}

/** Return the config file for a directory. */
export function configPath(directory = defaultConfigDir()): string {
  return join(directory, CONFIG_FILENAME);
}

/** Kept as a small compatibility helper; there is only one supported file now. */
export function findConfigPath(directory = defaultConfigDir()): string | undefined {
  const path = configPath(directory);
  return existsSync(path) ? path : undefined;
}

export function parseConfigContent(content: string, filename = CONFIG_FILENAME): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`could not parse config file ${filename}: ${message}`);
  }
  if (parsed === null || parsed === undefined) return {};
  if (!isRecord(parsed)) {
    throw new Error(`config file must contain an object: ${filename}`);
  }
  return parsed;
}

export function serializeConfigContent(
  value: Record<string, unknown>,
  _filename = CONFIG_FILENAME,
): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function readConfigFile(path: string): Record<string, unknown> {
  try {
    return parseConfigContent(readFileSync(path, "utf8"), path);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("could not parse config file")) {
      throw new Error(`could not read config file ${path}: ${error.message}`);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`could not read config file ${path}: ${message}`);
  }
}

export function writeConfigFile(path: string, value: Record<string, unknown>): void {
  atomicWriteFile(path, serializeConfigContent(value));
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
  writeConfigFile(path, {});
  return { path, created: true };
}

/** Resolve a relative config path next to the default config file. */
export function resolveConfigReference(reference: string, sourcePath: string): string {
  if (reference.startsWith("~")) return join(process.env.HOME || homedir(), reference.slice(1));
  return isAbsolute(reference) ? reference : resolve(dirname(sourcePath), reference);
}
