import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  bumpPatch,
  decideRelease,
  formatOutputs,
} from "../scripts/release-version.ts";

const scriptPath = fileURLToPath(
  new URL("../scripts/release-version.ts", import.meta.url),
);

test("bumpPatch increments only the patch component", () => {
  assert.equal(bumpPatch("1.2.3"), "1.2.4");
  assert.equal(bumpPatch("0.0.0"), "0.0.1");
});

test("bumpPatch drops prerelease and build metadata", () => {
  assert.equal(bumpPatch("1.2.3-beta.1"), "1.2.4");
  assert.equal(bumpPatch("1.2.3+build.7"), "1.2.4");
});

test("bumpPatch rejects non-semver input", () => {
  assert.throws(() => bumpPatch("1.2"), /Invalid semantic version/);
  assert.throws(() => bumpPatch("v1.2.3"), /Invalid semantic version/);
});

test("decideRelease releases the committed version when no tag exists", () => {
  assert.deepEqual(decideRelease("1.3.0", false), {
    needsBump: false,
    version: "1.3.0",
    tag: "v1.3.0",
  });
});

test("decideRelease bumps the patch when the version is already tagged", () => {
  assert.deepEqual(decideRelease("1.2.5", true), {
    needsBump: true,
    version: "1.2.6",
    tag: "v1.2.6",
  });
});

test("decideRelease validates the current version even when bumping", () => {
  assert.throws(() => decideRelease("nope", true), /Invalid semantic version/);
});

test("formatOutputs emits GITHUB_OUTPUT key=value lines", () => {
  assert.equal(
    formatOutputs(decideRelease("1.2.5", true)),
    "needs_bump=true\nversion=1.2.6\ntag=v1.2.6\n",
  );
  assert.equal(
    formatOutputs(decideRelease("1.3.0", false)),
    "needs_bump=false\nversion=1.3.0\ntag=v1.3.0\n",
  );
});

test("cli prints GITHUB_OUTPUT lines for the workflow", () => {
  const bump = execFileSync(
    process.execPath,
    [scriptPath, "--current", "1.2.5", "--tag-exists", "true"],
    { encoding: "utf8" },
  );
  assert.equal(bump, "needs_bump=true\nversion=1.2.6\ntag=v1.2.6\n");

  const manual = execFileSync(
    process.execPath,
    [scriptPath, "--current", "1.3.0", "--tag-exists", "false"],
    { encoding: "utf8" },
  );
  assert.equal(manual, "needs_bump=false\nversion=1.3.0\ntag=v1.3.0\n");
});
