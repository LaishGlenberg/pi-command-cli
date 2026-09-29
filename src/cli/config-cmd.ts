import { configDirectory, initConfigFile } from "../config/file.ts";
import { CONFIG_FILENAME, defaultConfigDir } from "../constants.ts";

function printConfigHelp(): void {
  process.stdout.write(`Usage: pi-cli --config\n\n`);
  process.stdout.write(`Creates the default pi-cli config at ${defaultConfigDir()}.\n`);
}

/** Handle the small compatibility initializer for the default config file. */
export function runConfigCommand(path?: string, args: readonly string[] = []): number {
  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      printConfigHelp();
      return 0;
    }
    throw new Error(`unknown option for --config: ${arg}`);
  }

  const directory = path || configDirectory();
  const { path: createdPath, created } = initConfigFile({
    directory,
    filename: CONFIG_FILENAME,
  });
  process.stdout.write(
    created
      ? `created pi-cli config at ${createdPath}\n`
      : `pi-cli config already exists at ${createdPath}\n`,
  );
  return 0;
}
