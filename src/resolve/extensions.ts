import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { DEFAULT_AGENT_DIR } from "../constants.ts";
import { addMatch, sourceNameMatches } from "./matching.ts";
import {
  isPiPackage,
  looksLikeExtensionDirectory,
  packageNameMatches,
  readPackageJson,
} from "./packages.ts";
import { walkEntries } from "./walk.ts";

interface SearchRoot {
  path: string;
  kind: "npm" | "git" | "extensions";
}

/**
 * Resolve an extension name to the path Pi expects.
 *
 * Search order is npm packages, git checkouts, then local extensions. Package
 * metadata is used for scoped packages and repositories whose folder name is
 * different from their package name.
 */
export function resolveExtension(
  requested: string,
  agentDir = process.env.PI_AGENT_DIR || DEFAULT_AGENT_DIR,
): string {
  if (!requested) {
    throw new Error("--extension requires an extension name or path");
  }

  // Explicit paths remain valid, including paths outside ~/.pi/agent.
  if (existsSync(requested)) return requested;

  const roots: SearchRoot[] = [
    { path: join(agentDir, "npm", "node_modules"), kind: "npm" },
    { path: join(agentDir, "git"), kind: "git" },
    { path: join(agentDir, "extensions"), kind: "extensions" },
  ];
  const matches: string[] = [];

  for (const root of roots) {
    if (!existsSync(root.path)) continue;
    const isNpm = root.kind === "npm";

    // One pass per root collects both name matches and package.json name
    // matches. npm package roots are at depth one, or depth two for scoped
    // packages; git and local extension trees may nest arbitrarily. Source
    // files are valid matches too -- e.g. extensions/orca-prefill.ts.
    for (const entry of walkEntries(root.path, isNpm ? { maxDepth: 3 } : {})) {
      if (entry.isDirectory) {
        if (
          entry.name === requested &&
          (!isNpm || entry.depth <= 2) &&
          looksLikeExtensionDirectory(entry.path)
        ) {
          addMatch(matches, entry.path);
        }
        continue;
      }

      if (!isNpm && sourceNameMatches(entry.name, requested)) {
        addMatch(matches, entry.path);
      }

      // A package's directory name is not always its package name (especially
      // for scoped npm packages and extensions checked out from git).
      if (entry.name === "package.json") {
        const directory = resolve(entry.path, "..");
        const packageJson = readPackageJson(directory);
        if (packageNameMatches(packageJson, requested) && isPiPackage(packageJson)) {
          addMatch(matches, directory);
        }
      }
    }
  }

  if (matches.length === 1) {
    const [match] = matches;
    if (match !== undefined) return match;
  }
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
