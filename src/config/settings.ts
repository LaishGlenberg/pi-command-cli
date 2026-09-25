import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { DEFAULT_AGENT_DIR, SETTINGS_FILENAME } from "../constants.ts";

export interface Settings {
  [key: string]: unknown;
}

export function settingsPath(): string {
  return join(process.env.PI_AGENT_DIR || DEFAULT_AGENT_DIR, SETTINGS_FILENAME);
}

export function readSettings(settingsFilePath?: string): Settings {
  const path = settingsFilePath || settingsPath();
  if (!existsSync(path)) return {};

  let settings: unknown;
  try {
    settings = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`could not read settings file ${path}: ${message}`);
  }

  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    throw new Error(`invalid settings file: ${path}`);
  }
  return settings as Settings;
}

export function writeSettings(settings: Settings, settingsFilePath?: string): void {
  const path = settingsFilePath || settingsPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
  chmodSync(path, 0o600);
}
