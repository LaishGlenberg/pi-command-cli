import { realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { SOURCE_EXTENSIONS } from "../constants.js";

export function canonicalPath(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

export function addMatch(matches, path) {
  const candidate = canonicalPath(path);
  if (!matches.includes(candidate)) matches.push(candidate);
}

export function sourceNameMatches(filename, requested) {
  return (
    filename === requested ||
    [...SOURCE_EXTENSIONS].some((extension) => filename === `${requested}${extension}`)
  );
}

export function skillFileNameMatches(filename, requested) {
  return filename === requested || filename === `${requested}.md`;
}

export function hasSkillFile(directory) {
  const skillPath = join(directory, "SKILL.md");
  try {
    return statSync(skillPath).isFile();
  } catch {
    return false;
  }
}

export function addSkillMatch(matches, path) {
  if (hasSkillFile(path)) addMatch(matches, path);
}
