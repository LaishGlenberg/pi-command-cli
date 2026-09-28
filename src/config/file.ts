import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { atomicWriteFile } from "./io.ts";

/** Folder pi-cli owns under `<agentDir>/extensions`. */
export const CONFIG_DIRECTORY_NAME = "pi-command-cli-config";

/**
 * Config filenames probed in order. The first match wins, so a JSONC file
 * takes precedence over a YAML one when both exist.
 */
export const CONFIG_FILENAMES = [
  "config.jsonc",
  "config.json",
  "config.yaml",
  "config.yml",
] as const;

export const DEFAULT_CONFIG_FILENAME = "config.jsonc";
export const YAML_CONFIG_FILENAME = "config.yaml";

export type ConfigFormat = "json" | "yaml";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Remove JSONC comments without changing text inside quoted strings. */
function stripJsonComments(content: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < content.length; index++) {
    const char = content[index];
    const next = content[index + 1];

    if (inString) {
      result += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      result += char;
    } else if (char === "/" && next === "/") {
      index += 1;
      while (index + 1 < content.length && content[index + 1] !== "\n") index += 1;
    } else if (char === "/" && next === "*") {
      index += 1;
      while (
        index + 1 < content.length &&
        !(content[index + 1] === "*" && content[index + 2] === "/")
      ) {
        index += 1;
      }
      index += 2;
    } else {
      result += char;
    }
  }

  return result;
}

/** Remove trailing commas while preserving commas inside quoted strings. */
function stripTrailingCommas(content: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < content.length; index++) {
    const char = content[index];
    if (inString) {
      result += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }

    if (char === ",") {
      let next = index + 1;
      while (/\s/.test(content[next] ?? "")) next += 1;
      if (content[next] === "}" || content[next] === "]") continue;
    }
    result += char;
  }

  return result;
}

function parseJsonc(content: string): unknown {
  return JSON.parse(stripTrailingCommas(stripJsonComments(content)));
}

export function configFormat(filename: string): ConfigFormat {
  const extension = extname(filename).toLowerCase();
  return extension === ".yaml" || extension === ".yml" ? "yaml" : "json";
}

/** Directory pi-cli looks in for its own config file. */
export function configDirectory(agentDir: string): string {
  return join(agentDir, "extensions", CONFIG_DIRECTORY_NAME);
}

/** First existing config file in a directory, honoring `CONFIG_FILENAMES` order. */
export function findConfigPath(configDir: string): string | undefined {
  for (const filename of CONFIG_FILENAMES) {
    const candidate = join(configDir, filename);
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return undefined;
}

/**
 * Parse an external config (JSONC, JSON, or YAML) into a top-level mapping.
 * YAML is a superset of JSON, so the `yaml` parser also handles any JSON body.
 */
export function parseConfigContent(content: string, filename = DEFAULT_CONFIG_FILENAME): Record<string, unknown> {
  const parsed = configFormat(filename) === "yaml" ? parseYaml(content) : parseJsonc(content);
  if (parsed === null || parsed === undefined) return {};
  if (!isRecord(parsed)) {
    throw new Error(`config file must contain a mapping at the top level: ${filename}`);
  }
  return parsed;
}

/** Serialize a config mapping back to its on-disk format. */
export function serializeConfigContent(value: Record<string, unknown>, filename: string): string {
  return configFormat(filename) === "yaml"
    ? stringifyYaml(value)
    : `${JSON.stringify(value, null, 2)}\n`;
}

export function readConfigFile(path: string): Record<string, unknown> {
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`could not read config file ${path}: ${message}`);
  }
  try {
    return parseConfigContent(content, path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`could not read config file ${path}: ${message}`);
  }
}

export function writeConfigFile(path: string, value: Record<string, unknown>): void {
  atomicWriteFile(path, serializeConfigContent(value, path));
}

function configTemplate(filename: string): string {
  if (configFormat(filename) === "yaml") {
    return [
      "# pi-cli configuration. Commented-out examples:",
      "# agents:",
      "#   searcher: pi-cli -e pi-intercom -s playwright-cli",
      "# custom:",
      "#   sys_prompts:",
      "#     - You are a reviewer agent.",
      "agents: {}",
      "custom: {}",
      "",
    ].join("\n");
  }
  return [
    "{",
    "  // Saved pi-cli configurations (see `pi-cli --save <name> ...`).",
    "  // Example:",
    '  //   "searcher": "pi-cli -e pi-intercom -s playwright-cli",',
    '  "agents": {},',
    "",
    "  // Custom fixtures available to `--custom`.",
    "  // Example:",
    '  //   "sys_prompts": ["You are a reviewer agent."],',
    '  "custom": {}',
    "}",
    "",
  ].join("\n");
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

/**
 * Create the pi-cli config directory and a starter config file. Refuses to
 * overwrite an existing file unless `force` is set, so `pi-cli --config` is
 * safe to run repeatedly.
 */
export function initConfigFile({
  directory,
  filename = DEFAULT_CONFIG_FILENAME,
  force = false,
}: InitConfigOptions): InitConfigResult {
  const path = join(directory, filename);
  if (existsSync(path) && !force) return { path, created: false };
  atomicWriteFile(path, configTemplate(filename));
  return { path, created: true };
}
