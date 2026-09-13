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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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
  // git-extension lives at github.com/example/git-extension so the directory
  // name matches, but the package.json name lookup is what finds it when the
  // directory name differs. Add a second copy with a different folder name.
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
  // Create a second match for "local-extension" inside the git root.
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
  await writeFile(join(agentDir, "extensions", "target.ts"), "export default () => {};");
  // Create a dangling symlink.
  await writeFile(join(agentDir, "extensions", "broken-link"), "");
  const { symlinkSync, unlinkSync } = await import("node:fs");
  symlinkSync(join(agentDir, "extensions", "nonexistent"), join(agentDir, "extensions", "dangling"));
  unlinkSync(join(agentDir, "extensions", "broken-link"));

  // Should still resolve without throwing on the broken symlink.
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
  // Create a second match for "playwright-cli" inside the git root.
  // The directory name itself must match for addSkillMatch to consider it.
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

test("expands extension flags and adds the default Pi flags", async () => {
  const agentDir = await fixture();
  const parsed = parseArguments(["-e", "pi-intercom", "--extension=local-extension", "hello"]);

  assert.deepEqual(buildPiArguments(parsed, agentDir), [
    "-ns",
    "-ne",
    "--extension",
    join(agentDir, "npm", "node_modules", "pi-intercom"),
    "--extension",
    join(agentDir, "extensions", "local-extension"),
    "hello",
  ]);
});

test("expands skill flags and only disables skill discovery", async () => {
  const agentDir = await fixture();
  const parsed = parseArguments(["-s", "playwright-cli", "--skill=pi-intercom"]);

  assert.deepEqual(buildPiArguments(parsed, agentDir), [
    "-ns",
    "--skill",
    join(agentDir, "skills", "playwright-cli.md"),
    "--skill",
    join(agentDir, "npm", "node_modules", "pi-intercom", "skills", "pi-intercom"),
  ]);
});

test("splits comma-separated extensions", async () => {
  const agentDir = await fixture();
  const parsed = parseArguments(["-e", "pi-intercom,local-extension"]);

  assert.deepEqual(buildPiArguments(parsed, agentDir), [
    "-ns",
    "-ne",
    "--extension",
    join(agentDir, "npm", "node_modules", "pi-intercom"),
    "--extension",
    join(agentDir, "extensions", "local-extension"),
  ]);
});

test("splits comma-separated skills", async () => {
  const agentDir = await fixture();
  const parsed = parseArguments(["-s", "playwright-cli,pi-intercom"]);

  assert.deepEqual(buildPiArguments(parsed, agentDir), [
    "-ns",
    "--skill",
    join(agentDir, "skills", "playwright-cli.md"),
    "--skill",
    join(agentDir, "npm", "node_modules", "pi-intercom", "skills", "pi-intercom"),
  ]);
});

test("individual flags still work alongside comma-separated", async () => {
  const agentDir = await fixture();
  const parsed = parseArguments(["-e", "pi-intercom", "-e", "local-extension"]);

  assert.deepEqual(buildPiArguments(parsed, agentDir), [
    "-ns",
    "-ne",
    "--extension",
    join(agentDir, "npm", "node_modules", "pi-intercom"),
    "--extension",
    join(agentDir, "extensions", "local-extension"),
  ]);
});

test("expands tool allowlist flags and adds -nbt", async () => {
  const agentDir = await fixture();
  const parsed = parseArguments(["-t", "read,bash", "--tools=edit"]);

  assert.deepEqual(buildPiArguments(parsed, agentDir), [
    "-ns",
    "-ne",
    "-nbt",
    "--tools",
    "read",
    "--tools",
    "bash",
    "--tools",
    "edit",
  ]);
});

test("adds -nbt with combined short tool flag", () => {
  const parsed = parseArguments(["-tread"]);
  assert.deepEqual(buildPiArguments(parsed, "/tmp/unused-agent"), [
    "-ns",
    "-ne",
    "-nbt",
    "--tools",
    "read",
  ]);
});

test("does not add -nbt when no tools flag is present", () => {
  const parsed = parseArguments(["--model", "google/gemini"]);
  assert.deepEqual(buildPiArguments(parsed, "/tmp/unused-agent"), [
    "-ns",
    "-ne",
    "--model",
    "google/gemini",
  ]);
});

test("supports opting out of the default discovery flags", () => {
  const parsed = parseArguments(["--no-defaults", "--model", "google/gemini"]);
  assert.deepEqual(buildPiArguments(parsed, "/tmp/unused-agent"), [
    "--model",
    "google/gemini",
  ]);
});

test("--nothing adds -ne -ns -nc -np -nbt and suppresses defaults", () => {
  const parsed = parseArguments(["--nothing"]);
  assert.deepEqual(buildPiArguments(parsed, "/tmp/unused-agent"), [
    "-ne",
    "-ns",
    "-nc",
    "-np",
    "-nbt",
  ]);
});

test("-n is a shorthand for --nothing", () => {
  const parsed = parseArguments(["-n"]);
  assert.deepEqual(buildPiArguments(parsed, "/tmp/unused-agent"), [
    "-ne",
    "-ns",
    "-nc",
    "-np",
    "-nbt",
  ]);
});

test("--nothing composes with -e to kill all extensions then load specific ones", async () => {
  const agentDir = await fixture();
  const parsed = parseArguments(["-n", "-e", "pi-intercom"]);
  assert.deepEqual(buildPiArguments(parsed, agentDir), [
    "-ne",
    "-ns",
    "-nc",
    "-np",
    "-nbt",
    "--extension",
    join(agentDir, "npm", "node_modules", "pi-intercom"),
  ]);
});

test("--nothing composes with -s to kill all skills then load specific ones", async () => {
  const agentDir = await fixture();
  const parsed = parseArguments(["-n", "-s", "playwright-cli"]);
  assert.deepEqual(buildPiArguments(parsed, agentDir), [
    "-ne",
    "-ns",
    "-nc",
    "-np",
    "-nbt",
    "--skill",
    join(agentDir, "skills", "playwright-cli.md"),
  ]);
});

test("--nothing passes through positional arguments", () => {
  const parsed = parseArguments(["-n", "hello world"]);
  assert.deepEqual(buildPiArguments(parsed, "/tmp/unused-agent"), [
    "-ne",
    "-ns",
    "-nc",
    "-np",
    "-nbt",
    "hello world",
  ]);
});

test("-n with -t does not duplicate -nbt", () => {
  const parsed = parseArguments(["-n", "-t", "read,bash"]);
  assert.deepEqual(buildPiArguments(parsed, "/tmp/unused-agent"), [
    "-ne",
    "-ns",
    "-nc",
    "-np",
    "-nbt",
    "--tools",
    "read",
    "--tools",
    "bash",
  ]);
});

// --- parseArguments: uncovered paths ---

test("--help returns a help sentinel", () => {
  const parsed = parseArguments(["--help"]);
  assert.equal(parsed.help, true);
});

test("-h is shorthand for --help", () => {
  const parsed = parseArguments(["-h"]);
  assert.equal(parsed.help, true);
});

test("--dry-run sets dryRun to true", () => {
  const parsed = parseArguments(["--dry-run"]);
  assert.equal(parsed.dryRun, true);
});

test("--allow-discovery is an alias for --no-defaults", () => {
  const parsed = parseArguments(["--allow-discovery"]);
  assert.equal(parsed.useDefaults, false);
});

test("--save captures the next argument as the config name", () => {
  const parsed = parseArguments(["--save", "myconfig"]);
  assert.equal(parsed.saveName, "myconfig");
});

test("--save= captures the name after the equals sign", () => {
  const parsed = parseArguments(["--save=myconfig"]);
  assert.equal(parsed.saveName, "myconfig");
});

test("--save without a name throws", () => {
  assert.throws(() => parseArguments(["--save"]), {
    message: "--save requires a config name",
  });
});

test("--save= with an empty name throws", () => {
  assert.throws(() => parseArguments(["--save="]), {
    message: "--save requires a config name",
  });
});

test("--import captures the next argument as the config name", () => {
  const parsed = parseArguments(["--import", "myconfig"]);
  assert.equal(parsed.importName, "myconfig");
});

test("--import= captures the name after the equals sign", () => {
  const parsed = parseArguments(["--import=myconfig"]);
  assert.equal(parsed.importName, "myconfig");
});

test("-i captures the attached name", () => {
  const parsed = parseArguments(["-imyconfig"]);
  assert.equal(parsed.importName, "myconfig");
});

test("--import without a name throws", () => {
  assert.throws(() => parseArguments(["--import"]), {
    message: "--import requires a config name",
  });
});

test("--import= with an empty name throws", () => {
  assert.throws(() => parseArguments(["--import="]), {
    message: "--import requires a config name",
  });
});

test("-e with attached value works like -e <value>", () => {
  const parsed = parseArguments(["-epi-intercom"]);
  assert.deepEqual(parsed.piArguments, ["--extension", "pi-intercom"]);
  assert.equal(parsed.hasExtension, true);
});

test("-s with attached value works like -s <value>", () => {
  const parsed = parseArguments(["-smy-skill"]);
  assert.deepEqual(parsed.piArguments, ["--skill", "my-skill"]);
  assert.equal(parsed.hasSkill, true);
});

test("-t with attached value works like -t <value>", () => {
  const parsed = parseArguments(["-tread,bash"]);
  assert.deepEqual(parsed.piArguments, ["-nbt", "--tools", "read", "--tools", "bash"]);
  assert.equal(parsed.hasTools, true);
});

test("--extension without a value throws", () => {
  assert.throws(() => parseArguments(["--extension"]), {
    message: "--extension requires an extension name or path",
  });
});

test("--extension= with an empty value throws", () => {
  assert.throws(() => parseArguments(["--extension="]), {
    message: "--extension requires an extension name or path",
  });
});

test("--skill without a value throws", () => {
  assert.throws(() => parseArguments(["--skill"]), {
    message: "--skill requires a skill name or path",
  });
});

test("--skill= with an empty value throws", () => {
  assert.throws(() => parseArguments(["--skill="]), {
    message: "--skill requires a skill name or path",
  });
});

test("--tools without a value throws", () => {
  assert.throws(() => parseArguments(["--tools"]), {
    message: "--tools requires a tool allowlist",
  });
});

test("--tools= with an empty value throws", () => {
  assert.throws(() => parseArguments(["--tools="]), {
    message: "--tools requires a tool allowlist",
  });
});

test("-- stops option parsing and passes remaining arguments through", () => {
  const parsed = parseArguments(["--model", "foo", "--", "--extension", "bar"]);
  assert.deepEqual(parsed.piArguments, ["--model", "foo", "--", "--extension", "bar"]);
  // The --extension after -- is just a positional, not parsed as an extension.
  assert.equal(parsed.hasExtension, false);
});

test("positional arguments are passed through", () => {
  const parsed = parseArguments(["hello", "world"]);
  assert.deepEqual(parsed.piArguments, ["hello", "world"]);
});

test("an empty argv returns defaults", () => {
  const parsed = parseArguments([]);
  assert.deepEqual(parsed.piArguments, []);
  assert.equal(parsed.useDefaults, true);
  assert.equal(parsed.hasExtension, false);
  assert.equal(parsed.hasSkill, false);
  assert.equal(parsed.hasTools, false);
  assert.equal(parsed.dryRun, false);
});

// ---------------------------------------------------------------------------
// buildPiArguments
// ---------------------------------------------------------------------------

test("buildPiArguments returns [] when help is set", () => {
  const parsed = { help: true, piArguments: [], useDefaults: true };
  assert.deepEqual(buildPiArguments(parsed, "/tmp/any"), []);
});

test("buildPiArguments throws on --extension= syntax", () => {
  const parsed = {
    piArguments: ["--extension="],
    useDefaults: true,
    hasExtension: true,
    hasSkill: false,
  };
  assert.throws(() => buildPiArguments(parsed, "/tmp/any"), {
    message: "--extension requires a name or path",
  });
});

test("buildPiArguments throws on --skill= syntax", () => {
  const parsed = {
    piArguments: ["--skill="],
    useDefaults: true,
    hasExtension: false,
    hasSkill: true,
  };
  assert.throws(() => buildPiArguments(parsed, "/tmp/any"), {
    message: "--skill requires a name or path",
  });
});

test("buildPiArguments adds -ns -ne by default", () => {
  const parsed = {
    piArguments: ["--model", "google/gemini"],
    useDefaults: true,
    hasExtension: false,
    hasSkill: false,
  };
  assert.deepEqual(buildPiArguments(parsed, "/tmp/any"), [
    "-ns",
    "-ne",
    "--model",
    "google/gemini",
  ]);
});

test("buildPiArguments adds only -ns when a skill is present but no extension", async () => {
  const agentDir = await fixture();
  const skillPath = join(agentDir, "skills", "playwright-cli.md");
  const parsed = {
    piArguments: ["--skill", skillPath],
    useDefaults: true,
    hasExtension: false,
    hasSkill: true,
  };
  assert.deepEqual(buildPiArguments(parsed, agentDir), [
    "-ns",
    "--skill",
    skillPath,
  ]);
});

test("buildPiArguments adds -ns -ne when both extension and skill are present", async () => {
  const agentDir = await fixture();
  const extPath = join(agentDir, "extensions", "local-extension");
  const skillPath = join(agentDir, "skills", "playwright-cli.md");
  const parsed = {
    piArguments: ["--extension", extPath, "--skill", skillPath],
    useDefaults: true,
    hasExtension: true,
    hasSkill: true,
  };
  assert.deepEqual(buildPiArguments(parsed, agentDir), [
    "-ns",
    "-ne",
    "--extension",
    extPath,
    "--skill",
    skillPath,
  ]);
});

test("buildPiArguments does not add defaults when useDefaults is false", () => {
  const parsed = {
    piArguments: ["--model", "foo"],
    useDefaults: false,
    hasExtension: false,
    hasSkill: false,
  };
  assert.deepEqual(buildPiArguments(parsed, "/tmp/any"), ["--model", "foo"]);
});

// ---------------------------------------------------------------------------
// saveConfig / loadConfig
// ---------------------------------------------------------------------------

test("saves raw resource names and imports exact or partial config names", async () => {
  const agentDir = await fixture();
  const configFile = join(agentDir, "pi-cli-configs.json");
  const parsed = parseArguments(["-e", "pi-intercom", "-s", "playwright-cli"]);

  saveConfig("searcher", parsed, configFile);
  const file = JSON.parse(await readFile(configFile, "utf8"));
  assert.deepEqual(file.configs.searcher.args, [
    "--extension",
    "pi-intercom",
    "--skill",
    "playwright-cli",
  ]);

  const loaded = loadConfig("search", configFile);
  assert.deepEqual(loaded.piArguments, file.configs.searcher.args);
  assert.equal(loaded.hasExtension, true);
  assert.equal(loaded.hasSkill, true);
});

test("saveConfig creates the config directory if it does not exist", async () => {
  const agentDir = await fixture();
  const configFile = join(agentDir, "subdir", "deep", "pi-cli-configs.json");
  const parsed = parseArguments(["-e", "pi-intercom"]);

  saveConfig("myconfig", parsed, configFile);
  const file = JSON.parse(await readFile(configFile, "utf8"));
  assert.deepEqual(file.configs.myconfig.args, ["--extension", "pi-intercom"]);
});

test("saveConfig rejects invalid config names", async () => {
  const agentDir = await fixture();
  const configFile = join(agentDir, "pi-cli-configs.json");
  const parsed = parseArguments([]);

  for (const badName of [".", "..", "a/b", "a\\b", "a\0b"]) {
    assert.throws(() => saveConfig(badName, parsed, configFile), {
      message: "config name must be non-empty and cannot contain path separators",
    });
  }
});

test("loadConfig throws when no config matches", async () => {
  const agentDir = await fixture();
  const configFile = join(agentDir, "pi-cli-configs.json");
  const parsed = parseArguments(["-e", "pi-intercom"]);
  saveConfig("myconfig", parsed, configFile);

  assert.throws(() => loadConfig("nonexistent", configFile), {
    message: /saved config not found: nonexistent/,
  });
});

test("loadConfig throws when the search is ambiguous", async () => {
  const agentDir = await fixture();
  const configFile = join(agentDir, "pi-cli-configs.json");
  // Use a search term that is a substring of both names but not an exact match.
  saveConfig("alpha-ext", parseArguments(["-e", "pi-intercom"]), configFile);
  saveConfig("alpha-skill", parseArguments(["-s", "playwright-cli"]), configFile);

  assert.throws(() => loadConfig("alpha", configFile), {
    message: /saved config search is ambiguous: alpha/,
  });
});

test("loadConfig returns an exact match when one exists", async () => {
  const agentDir = await fixture();
  const configFile = join(agentDir, "pi-cli-configs.json");
  saveConfig("beta", parseArguments(["-e", "pi-intercom"]), configFile);
  saveConfig("beta-extended", parseArguments(["-s", "playwright-cli"]), configFile);

  const loaded = loadConfig("beta", configFile);
  assert.deepEqual(loaded.piArguments, ["--extension", "pi-intercom"]);
});

test("loadConfig throws on an invalid config entry (no args array)", async () => {
  const agentDir = await fixture();
  const configFile = join(agentDir, "pi-cli-configs.json");
  // Write a corrupt store directly.
  await writeFile(
    configFile,
    JSON.stringify({ version: 1, configs: { broken: { args: null } } }, null, 2),
  );

  assert.throws(() => loadConfig("broken", configFile), {
    message: /invalid saved config: broken/,
  });
});

test("loadConfig throws on a malformed config file", async () => {
  const agentDir = await fixture();
  const configFile = join(agentDir, "pi-cli-configs.json");
  await writeFile(configFile, "not json{{{");

  assert.throws(() => loadConfig("anything", configFile), {
    message: /could not read config file/,
  });
});

test("loadConfig throws on a config file with invalid schema", async () => {
  const agentDir = await fixture();
  const configFile = join(agentDir, "pi-cli-configs.json");
  await writeFile(configFile, JSON.stringify({ version: 1, configs: "not-an-object" }));

  assert.throws(() => loadConfig("anything", configFile), {
    message: /invalid pi-cli config file/,
  });
});

test("loadConfig returns defaults for optional fields", async () => {
  const agentDir = await fixture();
  const configFile = join(agentDir, "pi-cli-configs.json");
  // Write a minimal valid entry directly.
  await writeFile(
    configFile,
    JSON.stringify({ version: 1, configs: { minimal: { args: [] } } }, null, 2),
  );

  const loaded = loadConfig("minimal", configFile);
  assert.deepEqual(loaded.piArguments, []);
  assert.equal(loaded.useDefaults, true);
  assert.equal(loaded.hasExtension, false);
  assert.equal(loaded.hasSkill, false);
  assert.equal(loaded.hasTools, false);
  assert.equal(loaded.dryRun, false);
});

test("loadConfig infers hasExtension/hasSkill/hasTools from args when flags are missing", async () => {
  const agentDir = await fixture();
  const configFile = join(agentDir, "pi-cli-configs.json");
  await writeFile(
    configFile,
    JSON.stringify(
      { version: 1, configs: { inferred: { args: ["--extension", "/x", "--skill", "/s", "--tools", "read"] } } },
      null,
      2,
    ),
  );

  const loaded = loadConfig("inferred", configFile);
  assert.equal(loaded.hasExtension, true);
  assert.equal(loaded.hasSkill, true);
  assert.equal(loaded.hasTools, true);
});

// ---------------------------------------------------------------------------
// main()
// ---------------------------------------------------------------------------

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

test("main prints help and returns 0 when --help is passed", async () => {
  const agentDir = await fixture();
  const result = withEnv({ PI_AGENT_DIR: agentDir, PI_BIN: "pi" }, () =>
    main(["--help"]),
  );
  assert.equal(result, 0);
});

test("main returns 1 and prints error when --save and --import are used together", async () => {
  const agentDir = await fixture();
  const result = withEnv({ PI_AGENT_DIR: agentDir, PI_BIN: "pi" }, () =>
    main(["--save", "foo", "--import", "bar"]),
  );
  assert.equal(result, 1);
});

test("main saves config and returns 0 when --save is used", async () => {
  const agentDir = await fixture();
  const configFile = join(agentDir, "pi-cli-configs.json");
  const result = withEnv(
    { PI_AGENT_DIR: agentDir, PI_CLI_CONFIG_FILE: configFile, PI_BIN: "pi" },
    () => main(["-e", "pi-intercom", "--save", "myconfig"]),
  );
  assert.equal(result, 0);
  const file = JSON.parse(await readFile(configFile, "utf8"));
  assert.deepEqual(file.configs.myconfig.args, ["--extension", "pi-intercom"]);
});

test("main prints the command and returns 0 on --dry-run", async () => {
  const agentDir = await fixture();
  const result = withEnv({ PI_AGENT_DIR: agentDir, PI_BIN: "pi" }, () =>
    main(["-e", "pi-intercom", "--dry-run"]),
  );
  assert.equal(result, 0);
});

test("main merges imported config with current arguments", async () => {
  const agentDir = await fixture();
  const configFile = join(agentDir, "pi-cli-configs.json");
  // First save a config.
  saveConfig("searcher", parseArguments(["-e", "pi-intercom"]), configFile);

  // Now import it with --dry-run to verify the merge.
  const result = withEnv(
    { PI_AGENT_DIR: agentDir, PI_CLI_CONFIG_FILE: configFile, PI_BIN: "pi" },
    () => main(["--import", "searcher", "--dry-run"]),
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

test("main returns 1 when --save is used with an invalid name", async () => {
  const agentDir = await fixture();
  const configFile = join(agentDir, "pi-cli-configs.json");
  const result = withEnv(
    { PI_AGENT_DIR: agentDir, PI_CLI_CONFIG_FILE: configFile, PI_BIN: "pi" },
    () => main(["--save", "a/b"]),
  );
  assert.equal(result, 1);
});

test("main returns 1 when --import references a missing config", async () => {
  const agentDir = await fixture();
  const configFile = join(agentDir, "pi-cli-configs.json");
  const result = withEnv(
    { PI_AGENT_DIR: agentDir, PI_CLI_CONFIG_FILE: configFile, PI_BIN: "pi" },
    () => main(["--import", "nonexistent"]),
  );
  assert.equal(result, 1);
});

// ---------------------------------------------------------------------------
// walkEntries edge cases (tested indirectly via resolveExtension/resolveSkill)
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
