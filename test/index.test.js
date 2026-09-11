import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildPiArguments, parseArguments, resolveExtension, resolveSkill } from "../index.js";

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

test("supports opting out of the default discovery flags", () => {
  const parsed = parseArguments(["--no-defaults", "--model", "google/gemini"]);
  assert.deepEqual(buildPiArguments(parsed, "/tmp/unused-agent"), [
    "--model",
    "google/gemini",
  ]);
});
