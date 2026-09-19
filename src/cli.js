import { spawn } from "node:child_process";

import {
  buildPiArguments,
  mergeParsedArguments,
  parseArguments,
  stripSaveFlag,
} from "./arguments.js";
import { loadConfig, saveConfig } from "./config.js";
import { printHelp } from "./help.js";
import { printHelpi } from "./pi-help-msg.js";

export function shellQuote(argument) {
  if (/^[a-zA-Z0-9_./:@%+=,-]+$/.test(argument)) return argument;
  return `'${argument.replaceAll("'", "'\\''")}'`;
}

export function main(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArguments(argv);
    if (parsed.help) {
      printHelp();
      return 0;
    }

    if (parsed.helpi) {
      printHelpi();
      return 0;
    }

    if (parsed.saveName && parsed.importName) {
      throw new Error("--save and --import cannot be used together");
    }

    if (parsed.saveName) {
      // Validate resource names now so a typo in an extension/skill name
      // fails before we write anything.
      buildPiArguments(parsed);
      const tokens = stripSaveFlag(argv);
      const command = ["pi-cli", ...tokens.map(shellQuote)].join(" ");
      const destination = saveConfig(parsed.saveName, command);
      process.stdout.write(`saved config "${parsed.saveName}" to ${destination}\n`);
      return 0;
    }

    if (parsed.importName) {
      const saved = loadConfig(parsed.importName);
      parsed = mergeParsedArguments(saved, parsed);
    }

    const piArguments = buildPiArguments(parsed);
    const piCommand = process.env.PI_BIN || "pi";

    if (parsed.dryRun) {
      process.stdout.write([piCommand, ...piArguments].map(shellQuote).join(" ") + "\n");
      return 0;
    }

    const child = spawn(piCommand, piArguments, { stdio: "inherit" });
    child.on("error", (error) => {
      process.stderr.write(`pi-cli: unable to run ${piCommand}: ${error.message}\n`);
      process.exitCode = 127;
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        process.exitCode = 128;
      } else {
        process.exitCode = code ?? 1;
      }
    });
    return undefined;
  } catch (error) {
    process.stderr.write(`pi-cli: ${error.message}\n`);
    return 1;
  }
}
