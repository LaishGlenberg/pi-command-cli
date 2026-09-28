import { resolveAgentDir } from "../constants.ts";
import {
  configDirectory,
  DEFAULT_CONFIG_FILENAME,
  initConfigFile,
  YAML_CONFIG_FILENAME,
} from "../config/file.ts";

function printConfigHelp(): void {
  process.stdout.write(`Usage: pi-cli --config [--yaml] [--force]\n\n`);
  process.stdout.write(
    `Creates a pi-cli config file in <agent-dir>/extensions/pi-command-cli-config.\n`,
  );
  process.stdout.write(
    `When that file exists it replaces settings.json for saved configs and custom fixtures.\n\n`,
  );
  process.stdout.write(`Options:\n`);
  process.stdout.write(`  --yaml     Create config.yaml instead of config.jsonc\n`);
  process.stdout.write(`  --force    Overwrite an existing config file\n`);
}

/**
 * Handle `pi-cli --config ...`. Extra args are the leftovers that
 * `parseArguments` forwarded to pi; only the config-mode flags are valid here.
 */
export function runConfigCommand(args: readonly string[]): number {
  let yaml = false;
  let force = false;

  for (const arg of args) {
    if (arg === "--yaml" || arg === "--yml") {
      yaml = true;
      continue;
    }
    if (arg === "--force" || arg === "-f") {
      force = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printConfigHelp();
      return 0;
    }
    throw new Error(`unknown option for --config: ${arg}`);
  }

  const directory = configDirectory(resolveAgentDir());
  const filename = yaml ? YAML_CONFIG_FILENAME : DEFAULT_CONFIG_FILENAME;
  const { path, created } = initConfigFile({ directory, filename, force });

  if (created) {
    process.stdout.write(`created pi-cli config at ${path}\n`);
  } else {
    process.stdout.write(`pi-cli config already exists at ${path} (use --force to overwrite)\n`);
  }
  return 0;
}
