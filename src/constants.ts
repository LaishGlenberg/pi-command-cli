import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_AGENT_DIR = join(homedir(), ".pi", "agent");
export const CONFIG_DIR_NAME = "pi-cli";
export const CONFIG_FILENAME = "config.json";
// Key under which `--path` records the active config directory in the default
// config file.
export const CONFIG_PATH_KEY = "path";
// Shell alias file generated next to config.json and sourced from the user's
// rc file. The marker comment lets `-aa` avoid adding the import twice.
export const ALIASES_FILENAME = "aliases.sh";
export const ALIASES_MARKER = "# pi-cli aliases";

/**
 * Fallback per-user config directory, frozen at import time. Runtime code
 * should call `defaultConfigDir()` instead so the location can be overridden.
 */
export const DEFAULT_CONFIG_DIR = join(homedir(), ".config", CONFIG_DIR_NAME);

/**
 * Resolve the default pi-cli config directory. `PI_CLI_CONFIG_DIR` overrides
 * the whole directory, then `$XDG_CONFIG_HOME` (falling back to `~/.config`)
 * selects the base, so tests can keep a real `~/.config/pi-cli` file out of
 * the way.
 */
export function defaultConfigDir(): string {
  const override = process.env.PI_CLI_CONFIG_DIR;
  if (override && override.trim() !== "") return override;
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.trim() !== "" ? xdg : join(homedir(), ".config");
  return join(base, CONFIG_DIR_NAME);
}

/**
 * Resolve the pi agent directory. `PI_AGENT_DIR` is pi-cli's historical
 * override; `PI_CODING_AGENT_DIR` is the variable pi itself documents, so
 * honor it as a fallback before the default.
 */
export function resolveAgentDir(): string {
  return process.env.PI_AGENT_DIR || process.env.PI_CODING_AGENT_DIR || DEFAULT_AGENT_DIR;
}

export const SOURCE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
]);

// Built-in tools Pi can enable. `-bt`/`--built-in-tools` keeps only the named
// ones active by turning the rest into `--exclude-tools`. grep/find/ls are off
// by default in Pi, so they must be enabled via Pi's own `defaultTools` setting
// before `-bt` can keep them.
export const BUILTIN_TOOLS = [
  "read",
  "bash",
  "powershell",
  "edit",
  "write",
  "grep",
  "find",
  "ls",
] as const;

export type BuiltinTool = (typeof BUILTIN_TOOLS)[number];

export function isBuiltinTool(value: string): value is BuiltinTool {
  return (BUILTIN_TOOLS as readonly string[]).includes(value);
}

export const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(["node_modules", ".git"]);
