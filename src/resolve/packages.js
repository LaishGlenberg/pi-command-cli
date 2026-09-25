import { readFileSync } from "node:fs";
import { extname, join } from "node:path";

import { SOURCE_EXTENSIONS } from "../constants.js";
import { walkEntries } from "./walk.js";

export function readPackageJson(directory) {
  const packagePath = join(directory, "package.json");
  try {
    return JSON.parse(readFileSync(packagePath, "utf8"));
  } catch {
    return undefined;
  }
}

export function isPiPackage(packageJson) {
  return Boolean(packageJson && packageJson.pi);
}

export function hasExtensionSource(directory) {
  for (const entry of walkEntries(directory)) {
    if (!entry.isDirectory && SOURCE_EXTENSIONS.has(extname(entry.name))) {
      return true;
    }
  }
  return false;
}

export function looksLikeExtensionDirectory(directory) {
  const packageJson = readPackageJson(directory);
  return isPiPackage(packageJson) || hasExtensionSource(directory);
}

export function packageNameMatches(packageJson, requested) {
  if (!packageJson || typeof packageJson.name !== "string") return false;
  return packageJson.name === requested || packageJson.name.split("/").pop() === requested;
}
