import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Integration test: pack the package the way npm would publish it, install it
// into a sandboxed global prefix (the same mechanism as `npm install -g`), and
// run the installed `pi-cli` bin. This catches packaging mistakes that unit
// tests cannot: a missing file in `files`, a broken `bin` mapping, or an entry
// point that only works from the source checkout.

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  return result;
}

const npmAvailable = run(npmCommand, ["--version"]).status === 0;

test(
  "installs globally from the packed tarball and runs the bin",
  { skip: npmAvailable ? false : "npm is not available", timeout: 120_000 },
  async () => {
    const workDir = await mkdtemp(join(tmpdir(), "pi-cli-npm-"));
    const prefix = join(workDir, "prefix");
    const agentDir = join(workDir, "agent");

    // 1. Pack exactly what `npm publish` would upload.
    const pack = run(
      npmCommand,
      ["pack", "--json", "--pack-destination", workDir, "--loglevel=error"],
      { cwd: projectRoot },
    );
    assert.equal(pack.status, 0, pack.stderr);

    const [info] = JSON.parse(pack.stdout);
    const tarball = join(workDir, info.filename);
    assert.ok(existsSync(tarball), `tarball was not created: ${tarball}`);

    // The published file list must include the bin entry and every src module.
    const packedPaths = info.files.map((file) => file.path);
    assert.ok(packedPaths.includes("index.js"), "index.js is missing from the tarball");
    assert.ok(packedPaths.includes("src/cli/main.js"), "src/cli/main.js is missing from the tarball");
    assert.ok(packedPaths.includes("src/cli/arguments.js"), "src/cli/arguments.js is missing from the tarball");

    // 2. Install into a throwaway global prefix. No registry access is needed
    //    because the package has zero dependencies.
    const install = run(npmCommand, [
      "install",
      "--global",
      "--prefix",
      prefix,
      tarball,
      "--no-audit",
      "--no-fund",
      "--ignore-scripts",
      "--loglevel=error",
    ]);
    assert.equal(install.status, 0, install.stderr);

    const binName = process.platform === "win32" ? "pi-cli.cmd" : "pi-cli";
    const bin = join(prefix, "bin", binName);
    assert.ok(existsSync(bin), `installed bin is missing: ${bin}`);

    // 3. Run the installed command. `-bt` exercises pi-cli's own argument
    //    handling and produces deterministic output without spawning pi.
    const result = run(bin, ["--dry-run", "-bt", "bash"], {
      env: { ...process.env, PI_AGENT_DIR: agentDir },
      // A .cmd shim cannot be spawned directly on Windows.
      shell: process.platform === "win32",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout.trim(),
      "pi --exclude-tools read,powershell,edit,write,grep,find,ls",
    );
  },
);
