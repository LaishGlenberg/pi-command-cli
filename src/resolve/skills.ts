import { existsSync } from "node:fs";
import { join } from "node:path";

import { DEFAULT_AGENT_DIR } from "../constants.ts";
import { addMatch, addSkillMatch, skillFileNameMatches } from "./matching.ts";
import { walkEntries } from "./walk.ts";

/**
 * Resolve a skill name to a file or skill directory accepted by Pi.
 * Global skills are searched first, followed by skills shipped alongside
 * extensions in npm, git, and the local extensions directory.
 */
export function resolveSkill(
  requested: string,
  agentDir = process.env.PI_AGENT_DIR || DEFAULT_AGENT_DIR,
): string {
  if (!requested) {
    throw new Error("--skill requires a skill name or path");
  }

  // Explicit files and directories remain valid, including paths outside the
  // agent directory.
  if (existsSync(requested)) return requested;

  const matches: string[] = [];
  const globalSkills = join(agentDir, "skills");

  if (existsSync(globalSkills)) {
    for (const entry of walkEntries(globalSkills)) {
      if (entry.isDirectory) {
        if (entry.name === requested) addSkillMatch(matches, entry.path);
      } else if (skillFileNameMatches(entry.name, requested)) {
        addMatch(matches, entry.path);
      }
    }
  }

  const extensionRoots = [
    join(agentDir, "npm", "node_modules"),
    join(agentDir, "git"),
    join(agentDir, "extensions"),
  ];

  for (const root of extensionRoots) {
    if (!existsSync(root)) continue;

    // SKILL.md is the marker for a skill directory, so scanning extension
    // trees does not mistake an ordinary source directory for a skill.
    for (const entry of walkEntries(root)) {
      if (entry.isDirectory) {
        if (entry.name === requested) addSkillMatch(matches, entry.path);
      } else if (skillFileNameMatches(entry.name, requested)) {
        addMatch(matches, entry.path);
      }
    }
  }

  if (matches.length === 1) {
    const [match] = matches;
    if (match !== undefined) return match;
  }
  if (matches.length === 0) {
    throw new Error(
      `skill not found: ${requested}\n` +
        `searched ${agentDir}/skills and skills inside ${agentDir}/npm/node_modules, ${agentDir}/git, and ${agentDir}/extensions`,
    );
  }

  throw new Error(
    `skill name is ambiguous: ${requested}\n` +
      matches.map((match) => `  ${match}`).join("\n") +
      "\nuse an explicit skill path to disambiguate",
  );
}
