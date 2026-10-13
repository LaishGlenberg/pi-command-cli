import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

import { ALIASES_MARKER } from "../constants.ts";
import { formatAliasWarnings, writeAliases } from "../config/aliases.ts";
import { readConfigFile } from "../config/config-file.ts";

export type ShellKind = "bash" | "zsh";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Detect bash or zsh from `$SHELL`. Handles Git Bash's `bash.exe` spelling and
 * returns `undefined` for anything else (fish, sh, unset, ...).
 */
export function detectShell(shell: string | undefined): ShellKind | undefined {
  if (!shell) return undefined;
  const name = shell.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
  const bare = name.endsWith(".exe") ? name.slice(0, -4) : name;
  if (bare === "bash") return "bash";
  if (bare === "zsh") return "zsh";
  return undefined;
}

/**
 * Resolve the rc file that should import the alias file. zsh honors `$ZDOTDIR`;
 * bash uses `~/.bashrc` (what Git Bash sources for interactive shells).
 */
export function resolveRcFile(
  shell: ShellKind,
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  if (shell === "zsh") {
    const zdotdir = env.ZDOTDIR;
    return join(zdotdir && zdotdir.trim() !== "" ? zdotdir : home, ".zshrc");
  }
  return join(home, ".bashrc");
}

/**
 * Express an absolute path in a shell-friendly way: forward slashes, and
 * `$HOME/...` when it lives under the home directory (so Windows drive letters
 * never leak into the rc line).
 */
export function shellPath(path: string, home: string = homedir()): string {
  const normalized = path.replace(/\\/g, "/");
  const normalizedHome = home.replace(/\\/g, "/");
  if (normalized === normalizedHome) return "$HOME";
  if (normalized.startsWith(`${normalizedHome}/`)) {
    return `$HOME/${normalized.slice(normalizedHome.length + 1)}`;
  }
  return normalized;
}

/** The marker comment plus the one-line source of the alias file. */
export function buildAliasImport(aliasPath: string, home: string = homedir()): string {
  const path = shellPath(aliasPath, home);
  return `${ALIASES_MARKER}\n[ -f "${path}" ] && . "${path}"`;
}

/** Whether the rc file already contains the pi-cli alias import. */
export function hasAliasImport(rcContent: string): boolean {
  return rcContent.includes(ALIASES_MARKER);
}

/**
 * Append the alias import to existing rc content, keeping a blank line between
 * it and whatever came before. Sourced with `.`, which works in bash and zsh.
 */
export function appendAliasImport(
  rcContent: string,
  aliasPath: string,
  home: string = homedir(),
): string {
  const block = buildAliasImport(aliasPath, home);
  if (rcContent === "") return `${block}\n`;
  const separator = rcContent.endsWith("\n") ? "\n" : "\n\n";
  return `${rcContent}${separator}${block}\n`;
}

async function promptConfirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

export interface AddAliasesOptions {
  env?: NodeJS.ProcessEnv;
  home?: string;
  confirm?: (question: string) => Promise<boolean>;
}

/**
 * Regenerate the alias file from the config, then offer to add the one-line
 * import to the user's rc file. Idempotent: running it again detects the marker
 * and makes no changes. In a non-interactive shell it prints the line instead of
 * prompting.
 */
export async function runAddAliases(
  configFilePath?: string,
  options: AddAliasesOptions = {},
): Promise<number> {
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();

  const config = readConfigFile(configFilePath);
  const agents = isObject(config.agents) ? config.agents : {};
  const { path: aliasPath, skipped, shadowed } = writeAliases(agents, configFilePath);
  process.stderr.write(formatAliasWarnings(skipped, shadowed));
  process.stdout.write(`pi-cli: wrote ${aliasPath}\n`);

  const shell = detectShell(env.SHELL);
  if (!shell) {
    throw new Error("could not detect bash or zsh from $SHELL; set SHELL or add the import manually");
  }

  const rcPath = resolveRcFile(shell, env, home);
  const existing = existsSync(rcPath) ? readFileSync(rcPath, "utf8") : undefined;

  if (existing !== undefined && hasAliasImport(existing)) {
    process.stdout.write(`pi-cli: aliases already imported in ${rcPath}\n`);
    return 0;
  }

  const line = buildAliasImport(aliasPath, home);

  if (!options.confirm && !process.stdin.isTTY) {
    process.stdout.write(`pi-cli: add this to ${rcPath}:\n\n${line}\n`);
    return 0;
  }

  const verb = existing === undefined ? `create ${rcPath} with` : `add to ${rcPath}`;
  const confirm = options.confirm ?? promptConfirm;
  const approved = await confirm(`pi-cli: ${verb} the alias import? [y/N] `);
  if (!approved) {
    process.stdout.write("pi-cli: left the rc file unchanged\n");
    return 0;
  }

  if (existing === undefined) {
    writeFileSync(rcPath, `${line}\n`, { mode: 0o644 });
  } else {
    appendFileSync(rcPath, `\n${line}\n`);
  }
  process.stdout.write(`pi-cli: updated ${rcPath}\n`);
  return 0;
}
