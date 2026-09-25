import { readFileSync } from "node:fs";
import { extname, join } from "node:path";

import { SOURCE_EXTENSIONS } from "../constants.ts";
import { walkEntries } from "./walk.ts";

export interface PackageJson {
  name?: unknown;
  pi?: unknown;
  [key: string]: unknown;
}

export function readPackageJson(directory: string): PackageJson | undefined {
  const packagePath = join(directory, "package.json");
  try {
    return JSON.parse(readFileSync(packagePath, "utf8")) as PackageJson;
  } catch {
    return undefined;
  }
}

export function isPiPackage(packageJson: PackageJson | undefined): boolean {
  return Boolean(packageJson && packageJson.pi);
}

export function hasExtensionSource(directory: string): boolean {
  for (const entry of walkEntries(directory)) {
    if (!entry.isDirectory && SOURCE_EXTENSIONS.has(extname(entry.name))) {
      return true;
    }
  }
  return false;
}

export function looksLikeExtensionDirectory(directory: string): boolean {
  const packageJson = readPackageJson(directory);
  return isPiPackage(packageJson) || hasExtensionSource(directory);
}

export function packageNameMatches(
  packageJson: PackageJson | undefined,
  requested: string,
): boolean {
  if (!packageJson || typeof packageJson.name !== "string") return false;
  return packageJson.name === requested || packageJson.name.split("/").pop() === requested;
}
