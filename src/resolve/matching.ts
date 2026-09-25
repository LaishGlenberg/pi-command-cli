import { realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { SOURCE_EXTENSIONS } from "../constants.ts";

export function canonicalPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

export function addMatch(matches: string[], path: string): void {
  const candidate = canonicalPath(path);
  if (!matches.includes(candidate)) matches.push(candidate);
}

export function sourceNameMatches(filename: string, requested: string): boolean {
  return (
    filename === requested ||
    [...SOURCE_EXTENSIONS].some((extension) => filename === `${requested}${extension}`)
  );
}

export function skillFileNameMatches(filename: string, requested: string): boolean {
  return filename === requested || filename === `${requested}.md`;
}

export function hasSkillFile(directory: string): boolean {
  const skillPath = join(directory, "SKILL.md");
  try {
    return statSync(skillPath).isFile();
  } catch {
    return false;
  }
}

export function addSkillMatch(matches: string[], path: string): void {
  if (hasSkillFile(path)) addMatch(matches, path);
}
