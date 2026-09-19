import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { DEFAULT_AGENT_DIR } from "./constants.js";
import { addMatch, sourceNameMatches } from "./matching.js";
import { isPiPackage, looksLikeExtensionDirectory, packageNameMatches, readPackageJson } from "./packages.js";
import { walkEntries } from "./walk.js";

/**
 * Resolve an extension name to the path Pi expects.
 *
 * Search order is npm packages, git checkouts, then local extensions. Package
 * metadata is used for scoped packages and repositories whose folder name is
 * different from their package name.
 */
export function resolveExtension(requested, agentDir = process.env.PI_AGENT_DIR || DEFAULT_AGENT_DIR) {
  if (!requested) {
    throw new Error("--extension requires an extension name or path");
  }

  // Explicit paths remain valid, including paths outside ~/.pi/agent.
  if (existsSync(requested)) return requested;

  const roots = [
    { path: join(agentDir, "npm", "node_modules"), kind: "npm" },
    { path: join(agentDir, "git"), kind: "git" },
    { path: join(agentDir, "extensions"), kind: "extensions" },
  ];
  const matches = [];

  for (const root of roots) {
    if (!existsSync(root.path)) continue;

    if (root.kind === "npm") {
      // Package roots are at depth one, or depth two for scoped packages.
      for (const entry of walkEntries(root.path, { maxDepth: 2, skipDirectories: new Set() })) {
        if (
          entry.isDirectory &&
          entry.name === requested &&
          looksLikeExtensionDirectory(entry.path)
        ) {
          addMatch(matches, entry.path);
        }
      }
    } else {
      // Git and local extension folders may be nested. Source files are also
      // valid -- e.g. extensions/orca-prefill.ts.
      for (const entry of walkEntries(root.path)) {
        if (entry.isDirectory) {
          if (entry.name === requested && looksLikeExtensionDirectory(entry.path)) {
            addMatch(matches, entry.path);
          }
        } else if (sourceNameMatches(entry.name, requested)) {
          addMatch(matches, entry.path);
        }
      }
    }

    // A package's directory name is not always its package name (especially
    // for scoped npm packages and extensions checked out from git).
    const packageDepth = root.kind === "npm" ? 3 : Infinity;
    for (const entry of walkEntries(root.path, { maxDepth: packageDepth })) {
      if (entry.isDirectory || entry.name !== "package.json") continue;
      const packageJson = readPackageJson(resolve(entry.path, ".."));
      if (packageNameMatches(packageJson, requested) && isPiPackage(packageJson)) {
        addMatch(matches, resolve(entry.path, ".."));
      }
    }
  }

  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new Error(
      `extension not found: ${requested}\n` +
        `searched ${agentDir}/npm/node_modules, ${agentDir}/git, and ${agentDir}/extensions`,
    );
  }

  throw new Error(
    `extension name is ambiguous: ${requested}\n` +
      matches.map((match) => `  ${match}`).join("\n") +
      "\nuse an explicit extension path to disambiguate",
  );
}
