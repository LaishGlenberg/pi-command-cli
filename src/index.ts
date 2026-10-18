export {
  ALIASES_FILENAME,
  ALIASES_MARKER,
  BUILTIN_EXTENSION_PREFIX,
  CONFIG_DIR_NAME,
  CONFIG_FILENAME,
  CONFIG_PATH_KEY,
  DEFAULT_AGENT_DIR,
  DEFAULT_CONFIG_DIR,
  defaultConfigDir,
  resolveAgentDir,
} from "./constants.ts";
export { resolveExtension } from "./resolve/extensions.ts";
export { resolveSkill } from "./resolve/skills.ts";
export { saveConfig, loadConfig, loadConfigListing, loadCustomFixtures } from "./config/config.ts";
export {
  configDir,
  configPath,
  defaultConfigPath,
  externalConfigPath,
  initConfigFile,
  isRecord,
  readConfigFile,
  resolveConfigReference,
  resolveConfigStore,
  setConfigPath,
  writeConfigFile,
  writeFileAtomic,
} from "./config/config-file.ts";
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
export type { ConfigFile, ConfigStore, InitConfigOptions, InitConfigResult } from "./config/config-file.ts";
export type { ConfigListing, SaveConfigResult } from "./config/config.ts";
export type { FormattedAliases, WrittenAliases } from "./config/aliases.ts";
export type { AddAliasesOptions, ShellKind } from "./cli/add-aliases.ts";
