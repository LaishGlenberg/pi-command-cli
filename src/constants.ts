import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_AGENT_DIR = join(homedir(), ".pi", "agent");
export const SETTINGS_FILENAME = "settings.json";
export const PI_CLI_KEY = "piCli";

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
// by default in Pi, so they must be enabled via settings.json `defaultTools`
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
