import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";

import { SKIPPED_DIRECTORIES } from "./constants.js";

/**
 * Walk a directory without following dependency trees or git metadata.
 * `maxDepth` is measured from `root` (root itself is depth zero).
 */
export function* walkEntries(root, { maxDepth = Infinity, skipDirectories = SKIPPED_DIRECTORIES } = {}) {
  const visited = new Set();

  function* visit(directory, depth) {
    let realDirectory;
    try {
      realDirectory = realpathSync(directory);
    } catch {
      return;
    }

    if (visited.has(realDirectory)) return;
    visited.add(realDirectory);

    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const path = join(directory, entry.name);
      let isDirectory = entry.isDirectory();

      // npm installations made with links (for example pnpm) still need to
      // be discoverable, but broken links should simply be ignored.
      if (entry.isSymbolicLink()) {
        try {
          isDirectory = statSync(path).isDirectory();
        } catch {
          continue;
        }
      }

      const entryDepth = depth + 1;
      yield { path, name: entry.name, isDirectory, depth: entryDepth };

      if (
        isDirectory &&
        entryDepth < maxDepth &&
        !skipDirectories.has(entry.name)
      ) {
        yield* visit(path, entryDepth);
      }
    }
  }

  if (existsSync(root)) yield* visit(root, 0);
}
