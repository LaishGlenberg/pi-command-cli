import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveAgentDir, SETTINGS_FILENAME } from "../constants.ts";
import { atomicWriteFile } from "./io.ts";

export interface Settings {
  [key: string]: unknown;
}

export function settingsPath(agentDir: string = resolveAgentDir()): string {
  return join(agentDir, SETTINGS_FILENAME);
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
  atomicWriteFile(path, `${JSON.stringify(settings, null, 2)}\n`);
}
