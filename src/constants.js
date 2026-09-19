import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_AGENT_DIR = join(homedir(), ".pi", "agent");
export const SETTINGS_FILENAME = "settings.json";
export const PI_CLI_KEY = "piCli";
export const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
export const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git"]);
