export { DEFAULT_AGENT_DIR } from "./constants.ts";
export { resolveExtension } from "./resolve/extensions.ts";
export { resolveSkill } from "./resolve/skills.ts";
export { saveConfig, loadConfig, loadConfigListing, loadCustomFixtures } from "./config/config.ts";
export { configDir, configPath } from "./config/config-file.ts";
export {
  aliasesPath,
  formatAliasWarnings,
  formatAliases,
  isShellBuiltin,
  isValidAliasName,
  writeAliases,
} from "./config/aliases.ts";
export { parseArguments, buildPiArguments, shellQuote, shellSplit } from "./cli/arguments.ts";
export {
  appendAliasImport,
  buildAliasImport,
  detectShell,
  hasAliasImport,
  resolveRcFile,
  runAddAliases,
  shellPath,
} from "./cli/add-aliases.ts";
export { resolveCustomExpression } from "./cli/custom.ts";
export { formatConfigListing, printConfigListing, supportsColor } from "./cli/list.ts";
export { main } from "./cli/main.ts";

export type { ParsedArguments } from "./cli/arguments.ts";
export type { CustomFixtures } from "./cli/custom.ts";
export type { ListingFormatOptions } from "./cli/list.ts";
export type { ConfigListing } from "./config/config.ts";
export type { ConfigFile } from "./config/config-file.ts";
export type { FormattedAliases, WrittenAliases } from "./config/aliases.ts";
export type { SaveConfigResult } from "./config/config.ts";
export type { AddAliasesOptions, ShellKind } from "./cli/add-aliases.ts";
