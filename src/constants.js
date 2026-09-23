import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_AGENT_DIR = join(homedir(), ".pi", "agent");
export const SETTINGS_FILENAME = "settings.json";
export const PI_CLI_KEY = "piCli";
export const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);

// Built-in tools Pi can enable. `-bt`/`--built-in-tools` keeps only the named
// ones active by turning the rest into `--exclude-tools`. grep/find/ls are off
// by default in Pi, so they must be enabled via settings.json `defaultTools`
// before `-bt` can keep them.
export const BUILTIN_TOOLS = ["read", "bash", "powershell", "edit", "write", "grep", "find", "ls"];
export const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git"]);
