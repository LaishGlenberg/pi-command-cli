#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { main } from "./src/index.ts";

// Re-export the public API straight from the barrel so the list lives in one
// place (`src/index.ts`). `main` is imported above to drive the bin entry.
export * from "./src/index.ts";

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
