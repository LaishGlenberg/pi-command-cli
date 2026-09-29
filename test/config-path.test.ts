import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { parseArguments, resolveConfigStore, saveConfig } from "../index.ts";

async function temporaryDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "pi-command-cli-config-"));
}

test("-p is parsed without forwarding it to pi", () => {
  const parsed = parseArguments(["--path", "/tmp/work-config", "--dry-run", "hello"]);
  assert.equal(parsed.configPath, "/tmp/work-config");
  assert.deepEqual(parsed.piArguments, ["hello"]);
});

test("saving to a path uses one JSON config file", async () => {
  const directory = await temporaryDirectory();
  const path = saveConfig("reviewer", "pi-cli --model fast", directory);
  assert.equal(path, join(directory, "config.json"));
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), {
    agents: { reviewer: "pi-cli --model fast" },
  });
  assert.equal(resolveConfigStore(directory).path, path);
  assert.equal(existsSync(join(directory, "settings.json")), false);
});

test("the default config records a custom path and later commands use it", async () => {
  const home = await temporaryDirectory();
  const custom = join(home, "saved");
  const script = `
    import { main } from './src/cli/main.ts';
    main(['--path', ${JSON.stringify(custom)}, '--save', 'work', '--model', 'fast']);
    main(['--import', 'work', '--dry-run']);
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: process.cwd(),
    env: { ...process.env, HOME: home },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /saved config .*config\.json/);
  assert.match(result.stdout, /pi --model fast/);
  const root = JSON.parse(readFileSync(join(home, ".config", "pi-cli", "config.json"), "utf8"));
  assert.equal(root.path, custom);
});
