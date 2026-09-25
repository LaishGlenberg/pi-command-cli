#!/usr/bin/env node
/**
 * Release version decision helper for `.github/workflows/release.yml`.
 *
 * Emits `key=value` lines intended to be appended to `$GITHUB_OUTPUT`:
 *
 *   needs_bump=true|false
 *   version=<next version>
 *   tag=v<version>
 *
 * A changed `package.json` version in the push means someone deliberately
 * bumped minor/major in the merged PR, so that version is released as-is.
 * Otherwise the patch version is bumped automatically.
 */

import { pathToFileURL } from "node:url";

export interface ReleaseDecision {
  needsBump: boolean;
  version: string;
  tag: string;
}

export function parseVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(
      `unsupported version "${version}" (expected MAJOR.MINOR.PATCH)`,
    );
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function bumpPatch(version: string): string {
  const [major, minor, patch] = parseVersion(version);
  return `${major}.${minor}.${patch + 1}`;
}

export function decideRelease(
  current: string,
  previous: string | null,
): ReleaseDecision {
  if (previous !== null && current === previous) {
    const version = bumpPatch(current);
    return { needsBump: true, version, tag: `v${version}` };
  }
  return { needsBump: false, version: current, tag: `v${current}` };
}

function readFlag(argv: string[], name: string): string | null {
  const index = argv.indexOf(name);
  if (index === -1) return null;
  return argv[index + 1] ?? null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const current = readFlag(process.argv, "--current");
  if (current === null) {
    console.error("release-version: --current <version> is required");
    process.exit(1);
  }
  const previous = readFlag(process.argv, "--previous");
  const decision = decideRelease(current, previous === "" ? null : previous);
  process.stdout.write(
    `needs_bump=${decision.needsBump}\n` +
      `version=${decision.version}\n` +
      `tag=${decision.tag}\n`,
  );
}
