import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildPiArguments,
  loadConfig,
  main,
  parseArguments,
  resolveExtension,
  resolveSkill,
  saveConfig,
} from "../index.js";
import { buildSpawnSpec, windowsQuote } from "../src/cli.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PI_CLI_KEY = "piCli";

async function fixture() {
  const agentDir = await mkdtemp(join(tmpdir(), "pi-command-cli-"));
  await mkdir(join(agentDir, "npm", "node_modules", "pi-intercom", "skills", "pi-intercom"), {
    recursive: true,
  });
  await mkdir(join(agentDir, "npm", "node_modules", "@scope", "scoped-ext"), {
    recursive: true,
  });
  await mkdir(join(agentDir, "git", "github.com", "example", "git-extension", "src"), {
    recursive: true,
  });
  await mkdir(join(agentDir, "extensions", "local-extension"), { recursive: true });
  await mkdir(join(agentDir, "skills"), { recursive: true });

  await writeFile(
    join(agentDir, "npm", "node_modules", "pi-intercom", "package.json"),
    JSON.stringify({ name: "pi-intercom", pi: { extensions: ["./index.ts"] } }),
  );
  await writeFile(
    join(agentDir, "npm", "node_modules", "@scope", "scoped-ext", "package.json"),
    JSON.stringify({ name: "@scope/scoped-ext", pi: { extensions: ["./index.ts"] } }),
  );
  await writeFile(
    join(agentDir, "git", "github.com", "example", "git-extension", "package.json"),
    JSON.stringify({ name: "git-extension", pi: { extensions: ["./src/index.ts"] } }),
  );
  await writeFile(
    join(agentDir, "npm", "node_modules", "pi-intercom", "skills", "pi-intercom", "SKILL.md"),
    "---\nname: pi-intercom\ndescription: Test skill\n---\n",
  );
  await writeFile(
    join(agentDir, "skills", "playwright-cli.md"),
    "---\nname: playwright-cli\ndescription: Test skill\n---\n",
  );
  await writeFile(
    join(agentDir, "git", "github.com", "example", "git-extension", "src", "index.ts"),
    "export default () => {};",
  );
  await writeFile(
    join(agentDir, "extensions", "local-extension", "index.ts"),
    "export default () => {};",
  );

  return agentDir;
}

function withEnv(overrides, fn) {
  const original = {};
  for (const key of Object.keys(overrides)) {
    original[key] = process.env[key];
    process.env[key] = overrides[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

// ---------------------------------------------------------------------------
// resolveExtension
// ---------------------------------------------------------------------------

test("finds npm, git, and local extensions by name", async () => {
  const agentDir = await fixture();

  assert.equal(
    resolveExtension("pi-intercom", agentDir),
    join(agentDir, "npm", "node_modules", "pi-intercom"),
  );
  assert.equal(
    resolveExtension("git-extension", agentDir),
    join(agentDir, "git", "github.com", "example", "git-extension"),
  );
  assert.equal(
    resolveExtension("local-extension", agentDir),
    join(agentDir, "extensions", "local-extension"),
  );
});

test("resolves scoped npm packages by their short name", async () => {
  const agentDir = await fixture();
  assert.equal(
    resolveExtension("scoped-ext", agentDir),
    join(agentDir, "npm", "node_modules", "@scope", "scoped-ext"),
  );
});

test("resolves an extension by its package.json name when the directory differs", async () => {
  const agentDir = await fixture();
  await mkdir(join(agentDir, "extensions", "different-folder"), { recursive: true });
  await writeFile(
    join(agentDir, "extensions", "different-folder", "package.json"),
    JSON.stringify({ name: "renamed-ext", pi: { extensions: ["./index.ts"] } }),
  );
  await writeFile(
    join(agentDir, "extensions", "different-folder", "index.ts"),
    "export default () => {};",
  );
  assert.equal(
    resolveExtension("renamed-ext", agentDir),
    join(agentDir, "extensions", "different-folder"),
  );
});

test("returns an explicit path unchanged when it exists", async () => {
  const agentDir = await fixture();
  const explicitPath = join(agentDir, "extensions", "local-extension");
  assert.equal(resolveExtension(explicitPath, agentDir), explicitPath);
});

test("throws when the extension name is empty", async () => {
  const agentDir = await fixture();
  assert.throws(() => resolveExtension("", agentDir), {
    message: "--extension requires an extension name or path",
  });
});

test("throws when no extension matches the requested name", async () => {
  const agentDir = await fixture();
  assert.throws(() => resolveExtension("nonexistent", agentDir), {
    message: /extension not found: nonexistent/,
  });
});

test("throws when the extension name is ambiguous", async () => {
  const agentDir = await fixture();
  await mkdir(join(agentDir, "git", "local-extension"), { recursive: true });
  await writeFile(
    join(agentDir, "git", "local-extension", "index.ts"),
    "export default () => {};",
  );
  assert.throws(() => resolveExtension("local-extension", agentDir), {
    message: /extension name is ambiguous: local-extension/,
  });
});

test("skips broken symlinks during directory walk", async () => {
  const agentDir = await fixture();
  const { symlinkSync } = await import("node:fs");
  symlinkSync(
    join(agentDir, "extensions", "nonexistent"),
    join(agentDir, "extensions", "dangling"),
  );
  assert.equal(
    resolveExtension("local-extension", agentDir),
    join(agentDir, "extensions", "local-extension"),
  );
});

// ---------------------------------------------------------------------------
// resolveSkill
// ---------------------------------------------------------------------------

test("finds global and extension skills by name", async () => {
  const agentDir = await fixture();
  assert.equal(
    resolveSkill("playwright-cli", agentDir),
    join(agentDir, "skills", "playwright-cli.md"),
  );
  assert.equal(
    resolveSkill("pi-intercom", agentDir),
    join(agentDir, "npm", "node_modules", "pi-intercom", "skills", "pi-intercom"),
  );
});

test("returns an explicit skill path unchanged when it exists", async () => {
  const agentDir = await fixture();
  const explicitPath = join(agentDir, "skills", "playwright-cli.md");
  assert.equal(resolveSkill(explicitPath, agentDir), explicitPath);
});

test("throws when the skill name is empty", async () => {
  const agentDir = await fixture();
  assert.throws(() => resolveSkill("", agentDir), {
    message: "--skill requires a skill name or path",
  });
});

test("throws when no skill matches the requested name", async () => {
  const agentDir = await fixture();
  assert.throws(() => resolveSkill("nonexistent", agentDir), {
    message: /skill not found: nonexistent/,
  });
});

test("throws when the skill name is ambiguous", async () => {
  const agentDir = await fixture();
  await mkdir(join(agentDir, "git", "playwright-cli"), { recursive: true });
  await writeFile(
    join(agentDir, "git", "playwright-cli", "SKILL.md"),
    "---\nname: playwright-cli\ndescription: Duplicate\n---\n",
  );
  assert.throws(() => resolveSkill("playwright-cli", agentDir), {
    message: /skill name is ambiguous: playwright-cli/,
  });
});

// ---------------------------------------------------------------------------
// parseArguments
// ---------------------------------------------------------------------------

test("expands extension flags and disables extension discovery only", async () => {
  const agentDir = await fixture();
  const parsed = parseArguments(["-e", "pi-intercom", "--extension=local-extension", "hello"]);
  assert.deepEqual(buildPiArguments(parsed, agentDir), [
    "-ne",
    "--extension", join(agentDir, "npm", "node_modules", "pi-intercom"),
    "--extension", join(agentDir, "extensions", "local-extension"),
    "hello",
  ]);
});

test("expands skill flags and only disables skill discovery", async () => {
  const agentDir = await fixture();
  const parsed = parseArguments(["-s", "playwright-cli", "--skill=pi-intercom"]);
  assert.deepEqual(buildPiArguments(parsed, agentDir), [
    "-ns",
    "--skill", join(agentDir, "skills", "playwright-cli.md"),
    "--skill", join(agentDir, "npm", "node_modules", "pi-intercom", "skills", "pi-intercom"),
  ]);
});

test("splits comma-separated extensions", async () => {
  const agentDir = await fixture();
  const parsed = parseArguments(["-e", "pi-intercom,local-extension"]);
  assert.deepEqual(buildPiArguments(parsed, agentDir), [
    "-ne",
    "--extension", join(agentDir, "npm", "node_modules", "pi-intercom"),
    "--extension", join(agentDir, "extensions", "local-extension"),
  ]);
});

test("splits comma-separated skills", async () => {
  const agentDir = await fixture();
  const parsed = parseArguments(["-s", "playwright-cli,pi-intercom"]);
  assert.deepEqual(buildPiArguments(parsed, agentDir), [
    "-ns",
    "--skill", join(agentDir, "skills", "playwright-cli.md"),
    "--skill", join(agentDir, "npm", "node_modules", "pi-intercom", "skills", "pi-intercom"),
  ]);
});

test("individual flags still work alongside comma-separated", async () => {
  const agentDir = await fixture();
  const parsed = parseArguments(["-e", "pi-intercom", "-e", "local-extension"]);
  assert.deepEqual(buildPiArguments(parsed, agentDir), [
    "-ne",
    "--extension", join(agentDir, "npm", "node_modules", "pi-intercom"),
    "--extension", join(agentDir, "extensions", "local-extension"),
  ]);
});

test("expands tool allowlist flags and adds -nbt", async () => {
  const agentDir = await fixture();
  const parsed = parseArguments(["-t", "read,bash", "--tools=edit"]);
  assert.deepEqual(buildPiArguments(parsed, agentDir), [
    "-nbt", "--tools", "read,bash", "--tools", "edit",
  ]);
});

test("adds -nbt with combined short tool flag", () => {
  const parsed = parseArguments(["-tread"]);
  assert.deepEqual(buildPiArguments(parsed, "/tmp/unused-agent"), [
    "-nbt", "--tools", "read",
  ]);
});

test("does not add -nbt when no tools flag is present", () => {
  const parsed = parseArguments(["--model", "google/gemini"]);
  assert.deepEqual(buildPiArguments(parsed, "/tmp/unused-agent"), [
    "--model", "google/gemini",
  ]);
});

test("supports opting out of the default discovery flags", () => {
  const parsed = parseArguments(["--no-defaults", "--model", "google/gemini"]);
  assert.deepEqual(buildPiArguments(parsed, "/tmp/unused-agent"), [
    "--model", "google/gemini",
  ]);
});

test("--nothing adds -ne -ns -nc -np -nbt and suppresses defaults", () => {
  const parsed = parseArguments(["--nothing"]);
  assert.deepEqual(buildPiArguments(parsed, "/tmp/unused-agent"), [
    "-ne", "-ns", "-nc", "-np", "-nbt",
  ]);
});

test("-n is a shorthand for --nothing", () => {
  const parsed = parseArguments(["-n"]);
  assert.deepEqual(buildPiArguments(parsed, "/tmp/unused-agent"), [
    "-ne", "-ns", "-nc", "-np", "-nbt",
  ]);
});

test("--nothing composes with -e", async () => {
  const agentDir = await fixture();
  const parsed = parseArguments(["-n", "-e", "pi-intercom"]);
  assert.deepEqual(buildPiArguments(parsed, agentDir), [
    "-ne", "-ns", "-nc", "-np", "-nbt",
    "--extension", join(agentDir, "npm", "node_modules", "pi-intercom"),
  ]);
});

test("--nothing composes with -s", async () => {
  const agentDir = await fixture();
  const parsed = parseArguments(["-n", "-s", "playwright-cli"]);
  assert.deepEqual(buildPiArguments(parsed, agentDir), [
    "-ne", "-ns", "-nc", "-np", "-nbt",
    "--skill", join(agentDir, "skills", "playwright-cli.md"),
  ]);
});

test("--nothing passes through positional arguments", () => {
  const parsed = parseArguments(["-n", "hello world"]);
  assert.deepEqual(buildPiArguments(parsed, "/tmp/unused-agent"), [
    "-ne", "-ns", "-nc", "-np", "-nbt", "hello world",
  ]);
});

test("-n with -t does not duplicate -nbt", () => {
  const parsed = parseArguments(["-n", "-t", "read,bash"]);
  assert.deepEqual(buildPiArguments(parsed, "/tmp/unused-agent"), [
    "-ne", "-ns", "-nc", "-np", "-nbt", "--tools", "read,bash",
  ]);
});

// --- uncovered parseArguments paths ---

test("--help returns a help sentinel", () => {
  assert.equal(parseArguments(["--help"]).help, true);
});

test("-h is shorthand for --help", () => {
  assert.equal(parseArguments(["-h"]).help, true);
});

test("--dry-run sets dryRun to true", () => {
  assert.equal(parseArguments(["--dry-run"]).dryRun, true);
});

test("--allow-discovery is an alias for --no-defaults", () => {
  assert.equal(parseArguments(["--allow-discovery"]).useDefaults, false);
});

test("--save captures the next argument as the config name", () => {
  assert.equal(parseArguments(["--save", "myconfig"]).saveName, "myconfig");
});

test("-S captures the next argument as the config name", () => {
  assert.equal(parseArguments(["-S", "myconfig"]).saveName, "myconfig");
});

test("--save= captures the name after the equals sign", () => {
  assert.equal(parseArguments(["--save=myconfig"]).saveName, "myconfig");
});

test("-S= captures the name after the equals sign via -Sxyz", () => {
  assert.equal(parseArguments(["-Smyconfig"]).saveName, "myconfig");
});

test("--save without a name throws", () => {
  assert.throws(() => parseArguments(["--save"]), {
    message: "--save requires a config name",
  });
});

test("-S without a name throws", () => {
  assert.throws(() => parseArguments(["-S"]), {
    message: "-S requires a config name",
  });
});

test("--save= with an empty name throws", () => {
  assert.throws(() => parseArguments(["--save="]), {
    message: "--save requires a config name",
  });
});

test("--import captures the next argument", () => {
  assert.equal(parseArguments(["--import", "myconfig"]).importName, "myconfig");
});

test("--import= captures the name after the equals sign", () => {
  assert.equal(parseArguments(["--import=myconfig"]).importName, "myconfig");
});

test("-i captures the attached name", () => {
  assert.equal(parseArguments(["-imyconfig"]).importName, "myconfig");
});

test("--import without a name throws", () => {
  assert.throws(() => parseArguments(["--import"]), {
    message: "--import requires a config name",
  });
});

test("-e with attached value works", () => {
  const parsed = parseArguments(["-epi-intercom"]);
  assert.deepEqual(parsed.piArguments, ["--extension", "pi-intercom"]);
});

test("-s with attached value works", () => {
  const parsed = parseArguments(["-smy-skill"]);
  assert.deepEqual(parsed.piArguments, ["--skill", "my-skill"]);
});

test("-t with attached value works", () => {
  const parsed = parseArguments(["-tread,bash"]);
  assert.deepEqual(parsed.piArguments, ["-nbt", "--tools", "read,bash"]);
});

test("--extension without a value throws", () => {
  assert.throws(() => parseArguments(["--extension"]), {
    message: "--extension requires an extension name or path",
  });
});

test("--skill without a value throws", () => {
  assert.throws(() => parseArguments(["--skill"]), {
    message: "--skill requires a skill name or path",
  });
});

test("--tools without a value throws", () => {
  assert.throws(() => parseArguments(["--tools"]), {
    message: "--tools requires a tool allowlist",
  });
});

test("-- stops option parsing", () => {
  const parsed = parseArguments(["--model", "foo", "--", "--extension", "bar"]);
  assert.deepEqual(parsed.piArguments, ["--model", "foo", "--", "--extension", "bar"]);
  assert.equal(parsed.hasExtension, false);
});

test("an empty argv returns defaults", () => {
  const parsed = parseArguments([]);
  assert.deepEqual(parsed.piArguments, []);
  assert.equal(parsed.useDefaults, true);
  assert.equal(parsed.dryRun, false);
});

// ---------------------------------------------------------------------------
// buildPiArguments
// ---------------------------------------------------------------------------

test("buildPiArguments returns [] when help is set", () => {
  assert.deepEqual(buildPiArguments({ help: true, piArguments: [] }, "/tmp/any"), []);
});

test("buildPiArguments throws on --extension= syntax", () => {
  assert.throws(() => buildPiArguments({
    piArguments: ["--extension="], useDefaults: true, hasExtension: true, hasSkill: false,
  }, "/tmp/any"), { message: "--extension requires a name or path" });
});

test("buildPiArguments throws on --skill= syntax", () => {
  assert.throws(() => buildPiArguments({
    piArguments: ["--skill="], useDefaults: true, hasExtension: false, hasSkill: true,
  }, "/tmp/any"), { message: "--skill requires a name or path" });
});

test("buildPiArguments adds only -ne when an extension is present but no skill", async () => {
  const agentDir = await fixture();
  const extPath = join(agentDir, "extensions", "local-extension");
  const parsed = {
    piArguments: ["--extension", extPath],
    useDefaults: true, hasExtension: true, hasSkill: false,
  };
  assert.deepEqual(buildPiArguments(parsed, agentDir), ["-ne", "--extension", extPath]);
});

test("buildPiArguments adds no discovery flags when no resources are named", () => {
  const parsed = {
    piArguments: ["--model", "foo"], useDefaults: true, hasExtension: false, hasSkill: false,
  };
  assert.deepEqual(buildPiArguments(parsed, "/tmp/any"), ["--model", "foo"]);
});

test("buildPiArguments adds only -ns when a skill is present but no extension", async () => {
  const agentDir = await fixture();
  const skillPath = join(agentDir, "skills", "playwright-cli.md");
  const parsed = {
    piArguments: ["--skill", skillPath],
    useDefaults: true, hasExtension: false, hasSkill: true,
  };
  assert.deepEqual(buildPiArguments(parsed, agentDir), ["-ns", "--skill", skillPath]);
});

test("buildPiArguments adds -ne -ns when both extension and skill are present", async () => {
  const agentDir = await fixture();
  const extPath = join(agentDir, "extensions", "local-extension");
  const skillPath = join(agentDir, "skills", "playwright-cli.md");
  const parsed = {
    piArguments: ["--extension", extPath, "--skill", skillPath],
    useDefaults: true, hasExtension: true, hasSkill: true,
  };
  assert.deepEqual(buildPiArguments(parsed, agentDir), [
    "-ne", "-ns", "--extension", extPath, "--skill", skillPath,
  ]);
});

test("buildPiArguments does not add defaults when useDefaults is false", () => {
  const parsed = {
    piArguments: ["--model", "foo"], useDefaults: false, hasExtension: false, hasSkill: false,
  };
  assert.deepEqual(buildPiArguments(parsed, "/tmp/any"), ["--model", "foo"]);
});

// ---------------------------------------------------------------------------
// saveConfig / loadConfig (using settings.json)
// ---------------------------------------------------------------------------

test("saveConfig writes command strings to settings.json under piCli", async () => {
  const agentDir = await fixture();
  const settingsFile = join(agentDir, "settings.json");

  saveConfig("a1", "pi-cli -e pi-intercom,rtk -s playwright-cli", settingsFile);
  const settings = JSON.parse(await readFile(settingsFile, "utf8"));
  assert.equal(settings.piCli["a1"], "pi-cli -e pi-intercom,rtk -s playwright-cli");
});

test("saveConfig creates settings.json if it does not exist", async () => {
  const agentDir = await fixture();
  const settingsFile = join(agentDir, "settings.json");

  saveConfig("x", "pi-cli --model google/gemini", settingsFile);
  const settings = JSON.parse(await readFile(settingsFile, "utf8"));
  assert.equal(settings.piCli["x"], "pi-cli --model google/gemini");
});

test("saveConfig preserves existing settings keys", async () => {
  const agentDir = await fixture();
  const settingsFile = join(agentDir, "settings.json");
  await writeFile(settingsFile, JSON.stringify({ theme: "dark", enabledModels: ["a/b"] }));

  saveConfig("x", "pi-cli -e pi-intercom", settingsFile);
  const settings = JSON.parse(await readFile(settingsFile, "utf8"));
  assert.equal(settings.theme, "dark");
  assert.deepEqual(settings.enabledModels, ["a/b"]);
  assert.equal(settings.piCli["x"], "pi-cli -e pi-intercom");
});

test("saveConfig rejects invalid config names", async () => {
  const agentDir = await fixture();
  const settingsFile = join(agentDir, "settings.json");
  for (const bad of [".", "..", "a/b", "a\\b", "a\0b"]) {
    assert.throws(() => saveConfig(bad, "pi-cli", settingsFile), {
      message: "config name must be non-empty and cannot contain path separators",
    });
  }
});

test("loadConfig finds an exact match and re-parses the command", async () => {
  const agentDir = await fixture();
  const settingsFile = join(agentDir, "settings.json");
  saveConfig("a1", "pi-cli -e pi-intercom -s playwright-cli", settingsFile);

  const loaded = loadConfig("a1", settingsFile);
  assert.deepEqual(loaded.piArguments, ["--extension", "pi-intercom", "--skill", "playwright-cli"]);
  assert.equal(loaded.hasExtension, true);
  assert.equal(loaded.hasSkill, true);
});

test("loadConfig finds a unique partial match (case-insensitive)", async () => {
  const agentDir = await fixture();
  const settingsFile = join(agentDir, "settings.json");
  saveConfig("searcher", "pi-cli -e pi-intercom", settingsFile);

  const loaded = loadConfig("search", settingsFile);
  assert.deepEqual(loaded.piArguments, ["--extension", "pi-intercom"]);
});

test("loadConfig throws when no config matches", async () => {
  const agentDir = await fixture();
  const settingsFile = join(agentDir, "settings.json");
  saveConfig("a1", "pi-cli -e pi-intercom", settingsFile);

  assert.throws(() => loadConfig("nonexistent", settingsFile), {
    message: /saved config not found: nonexistent/,
  });
});

test("loadConfig throws when the search is ambiguous", async () => {
  const agentDir = await fixture();
  const settingsFile = join(agentDir, "settings.json");
  saveConfig("alpha-ext", "pi-cli -e pi-intercom", settingsFile);
  saveConfig("alpha-skill", "pi-cli -s playwright-cli", settingsFile);

  assert.throws(() => loadConfig("alpha", settingsFile), {
    message: /saved config search is ambiguous: alpha/,
  });
});

test("loadConfig returns exact match even when partial would also match", async () => {
  const agentDir = await fixture();
  const settingsFile = join(agentDir, "settings.json");
  saveConfig("beta", "pi-cli -e pi-intercom", settingsFile);
  saveConfig("beta-extended", "pi-cli -s playwright-cli", settingsFile);

  const loaded = loadConfig("beta", settingsFile);
  assert.deepEqual(loaded.piArguments, ["--extension", "pi-intercom"]);
});

test("loadConfig throws on a non-string command value", async () => {
  const agentDir = await fixture();
  const settingsFile = join(agentDir, "settings.json");
  await writeFile(settingsFile, JSON.stringify({ piCli: { broken: 42 } }));

  assert.throws(() => loadConfig("broken", settingsFile), {
    message: /invalid saved config: broken/,
  });
});

test("loadConfig throws on a malformed settings file", async () => {
  const agentDir = await fixture();
  const settingsFile = join(agentDir, "settings.json");
  await writeFile(settingsFile, "not json{{{");

  assert.throws(() => loadConfig("anything", settingsFile), {
    message: /could not read settings file/,
  });
});

test("loadConfig throws when settings.json has no piCli key", async () => {
  const agentDir = await fixture();
  const settingsFile = join(agentDir, "settings.json");
  await writeFile(settingsFile, JSON.stringify({ theme: "dark" }));

  assert.throws(() => loadConfig("anything", settingsFile), {
    message: /no saved configs found/,
  });
});

// ---------------------------------------------------------------------------
// main()
// ---------------------------------------------------------------------------

test("main prints help and returns 0 when --help is passed", async () => {
  const agentDir = await fixture();
  const result = withEnv({ PI_AGENT_DIR: agentDir, PI_BIN: "pi" }, () =>
    main(["--help"]),
  );
  assert.equal(result, 0);
});

test("main returns 1 when --save and --import are used together", async () => {
  const agentDir = await fixture();
  const result = withEnv({ PI_AGENT_DIR: agentDir, PI_BIN: "pi" }, () =>
    main(["--save", "foo", "--import", "bar"]),
  );
  assert.equal(result, 1);
});

test("main saves config and returns 0 when --save is used", async () => {
  const agentDir = await fixture();
  const result = withEnv({ PI_AGENT_DIR: agentDir, PI_BIN: "pi" }, () =>
    main(["-e", "pi-intercom", "--save", "myconfig"]),
  );
  assert.equal(result, 0);
  const settings = JSON.parse(
    await readFile(join(agentDir, "settings.json"), "utf8"),
  );
  assert.equal(settings.piCli["myconfig"], "pi-cli -e pi-intercom");
});

test("main saves config with -S shorthand", async () => {
  const agentDir = await fixture();
  const result = withEnv({ PI_AGENT_DIR: agentDir, PI_BIN: "pi" }, () =>
    main(["-s", "playwright-cli", "-S", "my-skill-config"]),
  );
  assert.equal(result, 0);
  const settings = JSON.parse(
    await readFile(join(agentDir, "settings.json"), "utf8"),
  );
  assert.equal(settings.piCli["my-skill-config"], "pi-cli -s playwright-cli");
});

test("main prints the command and returns 0 on --dry-run", async () => {
  const agentDir = await fixture();
  const result = withEnv({ PI_AGENT_DIR: agentDir, PI_BIN: "pi" }, () =>
    main(["-e", "pi-intercom", "--dry-run"]),
  );
  assert.equal(result, 0);
});

test("main imports and merges a saved config", async () => {
  const agentDir = await fixture();
  withEnv({ PI_AGENT_DIR: agentDir, PI_BIN: "pi" }, () =>
    main(["-e", "pi-intercom", "--save", "base"]),
  );
  const result = withEnv({ PI_AGENT_DIR: agentDir, PI_BIN: "pi" }, () =>
    main(["--import", "base", "--dry-run"]),
  );
  assert.equal(result, 0);
});

test("main returns 1 when the extension cannot be resolved", async () => {
  const agentDir = await fixture();
  const result = withEnv({ PI_AGENT_DIR: agentDir, PI_BIN: "pi" }, () =>
    main(["-e", "nonexistent"]),
  );
  assert.equal(result, 1);
});

test("main returns 1 when the skill cannot be resolved", async () => {
  const agentDir = await fixture();
  const result = withEnv({ PI_AGENT_DIR: agentDir, PI_BIN: "pi" }, () =>
    main(["-s", "nonexistent"]),
  );
  assert.equal(result, 1);
});

test("main returns 1 when --import references a missing config", async () => {
  const agentDir = await fixture();
  const result = withEnv({ PI_AGENT_DIR: agentDir, PI_BIN: "pi" }, () =>
    main(["--import", "nonexistent"]),
  );
  assert.equal(result, 1);
});

test("main returns 1 when --save is used with an invalid name", async () => {
  const agentDir = await fixture();
  const result = withEnv({ PI_AGENT_DIR: agentDir, PI_BIN: "pi" }, () =>
    main(["--save", "a/b"]),
  );
  assert.equal(result, 1);
});

// ---------------------------------------------------------------------------
// Spawn spec
// ---------------------------------------------------------------------------

test("buildSpawnSpec passes the command through on POSIX", () => {
  const spec = buildSpawnSpec("pi", ["-ne", "--extension", "/tmp/ext"], "linux");
  assert.deepEqual(spec, {
    file: "pi",
    args: ["-ne", "--extension", "/tmp/ext"],
    options: {},
  });
});

test("buildSpawnSpec runs the command through cmd.exe on Windows", () => {
  const spec = buildSpawnSpec(
    "pi",
    ["-ne", "--extension", "C:\\Users\\u\\.pi\\x"],
    "win32",
    "C:\\Windows\\System32\\cmd.exe",
  );
  assert.equal(spec.file, "C:\\Windows\\System32\\cmd.exe");
  assert.deepEqual(spec.args, [
    "/d",
    "/s",
    "/c",
    '"pi -ne --extension C:\\Users\\u\\.pi\\x"',
  ]);
  assert.equal(spec.options.windowsVerbatimArguments, true);
});

test("buildSpawnSpec quotes a command path with spaces on Windows", () => {
  const spec = buildSpawnSpec(
    "C:\\Program Files\\pi\\pi.cmd",
    ["--version"],
    "win32",
    "cmd.exe",
  );
  assert.deepEqual(spec.args, [
    "/d",
    "/s",
    "/c",
    '""C:\\Program Files\\pi\\pi.cmd" --version"',
  ]);
});

test("windowsQuote leaves simple arguments untouched", () => {
  assert.equal(windowsQuote("pi-intercom"), "pi-intercom");
  assert.equal(windowsQuote("C:\\Users\\u\\.pi"), "C:\\Users\\u\\.pi");
});

test("windowsQuote quotes arguments with spaces or cmd metacharacters", () => {
  assert.equal(windowsQuote("hello world"), '"hello world"');
  assert.equal(windowsQuote("a&b"), '"a&b"');
  assert.equal(windowsQuote(""), '""');
});

test("windowsQuote escapes inner quotes and trailing backslashes", () => {
  assert.equal(windowsQuote('say "hi"'), '"say \\"hi\\""');
  assert.equal(windowsQuote("C:\\some path\\"), '"C:\\some path\\\\"');
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test("resolveExtension on a non-existent agent directory throws not-found", () => {
  assert.throws(() => resolveExtension("anything", "/tmp/does-not-exist-12345"), {
    message: /extension not found: anything/,
  });
});

test("resolveSkill on a non-existent agent directory throws not-found", () => {
  assert.throws(() => resolveSkill("anything", "/tmp/does-not-exist-12345"), {
    message: /skill not found: anything/,
  });
});
