import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  bumpPatch,
  decideRelease,
  parseVersion,
} from "../scripts/release-version.ts";

const scriptPath = fileURLToPath(
  new URL("../scripts/release-version.ts", import.meta.url),
);

test("parseVersion splits a MAJOR.MINOR.PATCH string", () => {
  assert.deepEqual(parseVersion("1.2.3"), [1, 2, 3]);
  assert.throws(() => parseVersion("1.2"), /unsupported version/);
  assert.throws(() => parseVersion("1.2.3-beta.1"), /unsupported version/);
});

test("bumpPatch increments only the patch component", () => {
  assert.equal(bumpPatch("1.2.3"), "1.2.4");
  assert.equal(bumpPatch("0.0.0"), "0.0.1");
});

test("decideRelease leaves a deliberate minor/major bump untouched", () => {
  assert.deepEqual(decideRelease("1.3.0", "1.2.5"), {
    needsBump: false,
    version: "1.3.0",
    tag: "v1.3.0",
  });
});

test("decideRelease bumps the patch when the version is unchanged", () => {
  assert.deepEqual(decideRelease("1.2.5", "1.2.5"), {
    needsBump: true,
    version: "1.2.6",
    tag: "v1.2.6",
  });
});

test("decideRelease treats a missing previous version as a manual release", () => {
  assert.deepEqual(decideRelease("1.2.5", null), {
    needsBump: false,
    version: "1.2.5",
    tag: "v1.2.5",
  });
});

test("cli prints GITHUB_OUTPUT lines for the workflow", () => {
  const bump = execFileSync(
    process.execPath,
    [scriptPath, "--current", "1.2.5", "--previous", "1.2.5"],
    { encoding: "utf8" },
  );
  assert.equal(bump, "needs_bump=true\nversion=1.2.6\ntag=v1.2.6\n");

  const manual = execFileSync(
    process.execPath,
    [scriptPath, "--current", "1.3.0", "--previous", "1.2.5"],
    { encoding: "utf8" },
  );
  assert.equal(manual, "needs_bump=false\nversion=1.3.0\ntag=v1.3.0\n");
});
