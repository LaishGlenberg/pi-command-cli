import { DEFAULT_AGENT_DIR } from "./constants.js";
import { resolveExtension } from "./extensions.js";
import { resolveSkill } from "./skills.js";

export function stripSaveFlag(argv) {
  const kept = [];
  let index = 0;
  while (index < argv.length) {
    const argument = argv[index];
    if (argument === "--save" || argument === "-S") {
      index += 2;
      continue;
    }
    if (argument.startsWith("--save=")) {
      index += 1;
      continue;
    }
    if (argument.startsWith("-S") && argument.length > 2) {
      index += 1;
      continue;
    }
    kept.push(argument);
    index += 1;
  }
  return kept;
}

export function mergeParsedArguments(saved, current) {
  return {
    piArguments: [...saved.piArguments, ...current.piArguments],
    useDefaults: saved.useDefaults && current.useDefaults,
    hasExtension: saved.hasExtension || current.hasExtension,
    hasSkill: saved.hasSkill || current.hasSkill,
    hasTools: saved.hasTools || current.hasTools,
    nothing: saved.nothing || current.nothing,
    dryRun: saved.dryRun || current.dryRun,
  };
}

export function parseArguments(argv) {
  const piArguments = [];
  let parseOptions = true;
  let useDefaults = true;
  const groups = new Set();
  let saveName;
  let importName;
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (parseOptions && argument === "--") {
      parseOptions = false;
      piArguments.push(argument);
      continue;
    }

    if (parseOptions && (argument === "--help" || argument === "-h")) {
      return { help: true };
    }

    if (parseOptions && (argument === "--helpi" || argument === "-hp")) {
      return { helpi: true };
    }

    if (parseOptions && (argument === "--nothing" || argument === "-n")) {
      groups.add("nothing");
      useDefaults = false;
      piArguments.push("-ne", "-ns", "-nc", "-np", "-nbt");
      groups.add("nbt");
      continue;
    }

    if (parseOptions && argument === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (parseOptions && (argument === "--save" || argument === "--import" || argument === "-i" || argument === "-S")) {
      const name = argv[index + 1];
      if (name === undefined) {
        throw new Error(`${argument} requires a config name`);
      }
      if (argument === "--save" || argument === "-S") saveName = name;
      else importName = name;
      index += 1;
      continue;
    }

    if (parseOptions && (argument.startsWith("--save=") || argument.startsWith("--import="))) {
      const [option, name] = argument.split("=", 2);
      if (!name) throw new Error(`${option} requires a config name`);
      if (option === "--save") saveName = name;
      else importName = name;
      continue;
    }

    if (parseOptions && argument.startsWith("-i") && argument.length > 2) {
      importName = argument.slice(2);
      continue;
    }

    if (parseOptions && argument.startsWith("-S") && argument.length > 2) {
      saveName = argument.slice(2);
      continue;
    }

    if (parseOptions && (argument === "--no-defaults" || argument === "--allow-discovery")) {
      useDefaults = false;
      continue;
    }

    if (parseOptions && (argument === "--extension" || argument === "-e")) {
      groups.add("extension");
      const requested = argv[index + 1];
      if (requested === undefined) {
        throw new Error(`${argument} requires an extension name or path`);
      }
      for (const item of requested.split(",")) {
        piArguments.push("--extension", item);
      }
      index += 1;
      continue;
    }

    if (parseOptions && argument.startsWith("--extension=")) {
      groups.add("extension");
      const requested = argument.slice("--extension=".length);
      if (!requested) throw new Error("--extension requires an extension name or path");
      for (const item of requested.split(",")) {
        piArguments.push("--extension", item);
      }
      continue;
    }

    if (parseOptions && argument.startsWith("-e") && argument.length > 2) {
      groups.add("extension");
      for (const item of argument.slice(2).split(",")) {
        piArguments.push("--extension", item);
      }
      continue;
    }

    if (parseOptions && (argument === "--skill" || argument === "-s")) {
      groups.add("skill");
      const requested = argv[index + 1];
      if (requested === undefined) {
        throw new Error(`${argument} requires a skill name or path`);
      }
      for (const item of requested.split(",")) {
        piArguments.push("--skill", item);
      }
      index += 1;
      continue;
    }

    if (parseOptions && argument.startsWith("--skill=")) {
      groups.add("skill");
      const requested = argument.slice("--skill=".length);
      if (!requested) throw new Error("--skill requires a skill name or path");
      for (const item of requested.split(",")) {
        piArguments.push("--skill", item);
      }
      continue;
    }

    if (parseOptions && argument.startsWith("-s") && argument.length > 2) {
      groups.add("skill");
      for (const item of argument.slice(2).split(",")) {
        piArguments.push("--skill", item);
      }
      continue;
    }

    if (parseOptions && (argument === "--tools" || argument === "-t")) {
      groups.add("tools");
      if (!groups.has("nbt")) {
        groups.add("nbt");
        piArguments.push("-nbt");
      }
      const requested = argv[index + 1];
      if (requested === undefined) {
        throw new Error(`${argument} requires a tool allowlist`);
      }
      piArguments.push("--tools", requested);
      index += 1;
      continue;
    }

    if (parseOptions && argument.startsWith("--tools=")) {
      groups.add("tools");
      if (!groups.has("nbt")) {
        groups.add("nbt");
        piArguments.push("-nbt");
      }
      const requested = argument.slice("--tools=".length);
      if (!requested) throw new Error("--tools requires a tool allowlist");
      piArguments.push("--tools", requested);
      continue;
    }

    if (parseOptions && argument.startsWith("-t") && argument.length > 2) {
      groups.add("tools");
      if (!groups.has("nbt")) {
        groups.add("nbt");
        piArguments.push("-nbt");
      }
      piArguments.push("--tools", argument.slice(2));
      continue;
    }

    piArguments.push(argument);
  }

  return {
    piArguments,
    useDefaults,
    hasExtension: groups.has("extension"),
    hasSkill: groups.has("skill"),
    hasTools: groups.has("tools"),
    nothing: groups.has("nothing"),
    saveName,
    importName,
    dryRun,
  };
}

export function buildPiArguments(parsed, agentDir = process.env.PI_AGENT_DIR || DEFAULT_AGENT_DIR) {
  if (parsed.help) return [];

  const resolved = [];
  for (let index = 0; index < parsed.piArguments.length; index += 1) {
    const argument = parsed.piArguments[index];
    resolved.push(argument);
    if (argument === "--extension") {
      resolved.push(resolveExtension(parsed.piArguments[index + 1], agentDir));
      index += 1;
    } else if (argument === "--skill") {
      resolved.push(resolveSkill(parsed.piArguments[index + 1], agentDir));
      index += 1;
    } else if (argument === "--extension=" || argument === "--skill=") {
      // parseArguments normalizes equals syntax, but keep this guard for
      // callers using buildPiArguments directly.
      throw new Error(`${argument.slice(0, -1)} requires a name or path`);
    }
  }

  if (!parsed.useDefaults) return resolved;
  // Naming a resource disables Pi's automatic discovery for that resource
  // type only. With no -e/-s flags, pi-cli is a transparent pass-through to
  // pi and adds no discovery flags of its own.
  const discoveryFlags = [];
  if (parsed.hasExtension) discoveryFlags.push("-ne");
  if (parsed.hasSkill) discoveryFlags.push("-ns");
  return [...discoveryFlags, ...resolved];
}
