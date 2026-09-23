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

/**
 * Quote a single argument for a `cmd.exe /c` command line. The target process
 * parses the line with MSVCRT rules, so backslashes before a quote (and before
 * the closing quote) must be doubled. Note that cmd still expands `%VAR%`
 * inside quotes; that is inherent to running the command through cmd.
 */
export function windowsQuote(argument) {
  if (argument === "") return '""';
  if (!/[\s"&|<>^()%!]/.test(argument)) return argument;
  const escaped = argument
    .replace(/(\\*)"/g, '$1$1\\"')
    .replace(/(\\+)$/, "$1$1");
  return `"${escaped}"`;
}

/**
 * Build the spawn file/args for the current platform. On Windows, npm shims
 * like `pi.cmd` cannot be spawned directly, so the command is run through
 * `cmd.exe /d /s /c`. `windowsVerbatimArguments` stops Node from re-quoting
 * the command line we assembled ourselves.
 */
export function buildSpawnSpec(
  command,
  args,
  platform = process.platform,
  comspec = process.env.ComSpec,
) {
  if (platform !== "win32") {
    return { file: command, args: [...args], options: {} };
  }
  const line = [command, ...args].map(windowsQuote).join(" ");
  return {
    file: comspec || "cmd.exe",
    args: ["/d", "/s", "/c", `"${line}"`],
    options: { windowsVerbatimArguments: true },
  };
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

    const spec = buildSpawnSpec(piCommand, piArguments);
    const child = spawn(spec.file, spec.args, { stdio: "inherit", ...spec.options });
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
