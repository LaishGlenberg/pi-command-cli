import { chmodSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Write a file atomically with `0600` permissions: create the parent directory
 * (owner-only), write a temp file beside the target, then rename it into
 * place. Used for pi-cli's JSON config files.
 * a crash can never leave a half-written file behind.
 */
export function atomicWriteFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, content, { mode: 0o600 });
  renameSync(temporary, path);
  chmodSync(path, 0o600);
}
