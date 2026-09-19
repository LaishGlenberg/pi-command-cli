#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { main } from "./src/cli.js";

export {
  DEFAULT_AGENT_DIR,
  resolveExtension,
  resolveSkill,
  saveConfig,
  loadConfig,
  parseArguments,
  buildPiArguments,
  main,
} from "./src/index.js";

let invokedPath = "";
if (process.argv[1]) {
  try {
    invokedPath = realpathSync(process.argv[1]);
  } catch {
    // Importing the module from a non-file entry point should not execute it.
  }
}
const modulePath = fileURLToPath(import.meta.url);
if (invokedPath === modulePath) {
  const result = main();
  if (result !== undefined) process.exitCode = result;
}
