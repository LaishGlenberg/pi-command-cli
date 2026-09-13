import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildPiArguments,
  loadConfig,
  parseArguments,
  resolveExtension,
  resolveSkill,
  saveConfig,
} from "../index.js";

async function fixture() {
  const agentDir = await mkdtemp(join(tmpdir(), "pi-command-cli-"));
  await mkdir(join(agentDir, "npm", "node_modules", "pi-intercom", "skills", "pi-intercom"), {
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
