# AGENTS.md

Guidance for agents working in `@lglen/pi-command-cli` (`pi-cli`).

## What this project is

A small zero-dependency Node CLI that wraps the `pi` coding agent. Its job is to
make `pi` startup ergonomic: resolve extension and skill names to absolute paths,
add the right discovery flags, and save/load named launch configs. It is a
transparent pass-through for every other `pi` flag.

## Commands

```bash
node --test          # run the test suite (89 tests, node:test)
npm test             # same
npm link             # expose `pi-cli` locally
pi-cli --dry-run ... # print the expanded `pi ...` command without spawning
```

There is no build step, no bundler, and no runtime dependencies. Node >= 18.13,
ESM (`"type": "module"`). Tests use the built-in `node:test` + `node:assert/strict`
only.

## Architecture

Entry flow: `index.js` (bin) → `src/cli.js#main` → `src/arguments.js`.

```
index.js            Bin entry; runs main() when invoked directly, re-exports public API
src/
  index.js          Barrel re-export of the public API (keep in sync with index.js)
  cli.js            main() orchestration, shell/Windows quoting, child spawn
  arguments.js      parseArguments + buildPiArguments (the core logic)
  constants.js      Agent dir, settings filename, piCli key, source extensions
  help.js           `pi-cli --help` text
  pi-help-msg.js    `pi-cli --helpi` text (pi's own help; keep roughly in sync with pi)
  settings.js       Atomic, permissioned settings.json read/write
  config.js         saveConfig/loadConfig on top of settings.js
  walk.js           Recursive directory walker (skips node_modules/.git, symlink-safe)
  packages.js       package.json parsing and "is this a pi extension dir" checks
  matching.js       Path canonicalization and name-matching helpers
  extensions.js     Extension name → path resolution
  skills.js         Skill name → path resolution
test/index.test.js  All tests

graphify-out/        Committed knowledge graph of this repo (see below)
```

### Core flow

1. `parseArguments(argv)` walks argv left to right. It handles pi-cli's own
   flags (`-e`, `-s`, `-bt`/`--built-in-tools`, `-i`/`--import`, `-S`/`--save`,
   `-n`/`--nothing`, `--no-defaults`, `--dry-run`, help) and pushes everything
   else, untouched, into `piArguments`. `-e`/`-s` support repeated,
   comma-separated, `--flag=value`, and attached (`-efoo,bar`) forms, and
   normalize them to `--extension <value>` / `--skill <value>` pairs.
2. `buildPiArguments(parsed, agentDir)` resolves every `--extension`/`--skill`
   value through `resolveExtension`/`resolveSkill`, then prepends discovery
   flags: `-ne` if any extension was named, `-ns` if any skill was named.
3. `main()` optionally loads/merges a saved config, builds the argument list,
   and either prints it (`--dry-run`) or spawns `pi` (or `$PI_BIN`).

### Discovery-flag invariant (important)

Naming a resource disables discovery for *that resource type only*:

- any `-e` → add `-ne` (extensions discovery off; skills still load)
- any `-s` → add `-ns` (skills discovery off; extensions still load)
- no `-e`/`-s` → add nothing; pi-cli is a transparent pass-through
- `-n`/`--nothing` → explicit `-ne -ns -nc -np`, and `useDefaults = false` so no
  flags are auto-added on top

Do not "helpfully" add `-nbt` or other tool flags here.

`-bt`/`--built-in-tools` is the one tool flag pi-cli manages. It keeps only the
named built-ins by emitting `--exclude-tools <BUILTIN_TOOLS minus allowlist>`.
It must **not** use `--tools`/`-t`: that is a strict allowlist across built-in,
extension, and custom tools and would disable the very extension tools `-e`
loads. `--tools`/`-t` typed by the user are still passed through unchanged.
Caveat to preserve: `--exclude-tools` only removes; Pi's default built-ins are
`read, bash, edit, write`, so `grep`/`find`/`ls` must be enabled via the
`defaultTools` setting before `-bt` can keep them.

## Conventions

- Plain ESM, named exports, no classes, no external deps. Prefer small pure
  functions so they can be unit-tested directly.
- Errors: throw `Error` with a lowercase, actionable message that includes the
  searched locations or the ambiguity list. `main()` catches and prints
  `pi-cli: <message>` to stderr, returning exit code 1.
- Resolution must stay deterministic: return an explicit path if it exists,
  otherwise search, and on 0 or >1 matches throw rather than guess.
- Keep `src/index.js` and `index.js` re-exports aligned when adding public API.
- Windows matters: never spawn a `.cmd` directly. Route through
  `buildSpawnSpec`/`windowsQuote` (cmd.exe `/d /s /c`) and keep the
  `windowsVerbatimArguments` option.
- `settings.json` is shared with pi. Only touch the `piCli` key, write
  atomically (temp + rename) with `0600`, and preserve unrelated keys.

## Knowledge graph (graphify)

`graphify-out/` is a checked-in knowledge graph of this repo, built with the
`graphify` skill (`~/.pi/agent/skills/graphify/SKILL.md`, binary at
`~/.local/bin/graphify`). It is not build output to ignore — treat it as a
committed artifact.

- **Query before grepping.** For architecture questions ("what calls X",
  "how does resolution flow"), use the graph first: the `graphify` skill, or
  `graphify query "<question>"`. `GRAPH_REPORT.md` has the human-readable
  summary (god nodes, communities, gaps).
- **Refresh after meaningful changes.** Run the graphify skill with `--update`
  (e.g. `/graphify . --update`) after adding/moving files or changing module
  structure, then commit the regenerated artifacts. Pure code changes are
  re-extracted via AST with no LLM; doc/README changes also refresh semantic
  nodes.
- **Tracked:** `graph.json`, `GRAPH_REPORT.md`, `graph.html`, `manifest.json`,
  `.graphify_labels.json`.
- **Ignored (machine-specific):** `cache/`, `memory/`, `reflections/`,
  `cost.json`, `.vocab.txt`, `.graphify_python`, `.graphify_root`,
  `.graphify_learning.json`. Never commit these.
- `manifest.json` stores per-file `ast_hash`/`semantic_hash` used for
  incremental updates. Don't hand-edit it or the graph; regenerate instead.

## Testing

- Add tests to `test/index.test.js`. Use the `fixture()` helper to build a fake
  agent dir (npm/git/extensions/skills trees) and `withEnv` to set
  `PI_AGENT_DIR` / `PI_BIN`.
- Prefer asserting on `parseArguments` output and `buildPiArguments` output
  rather than spawning pi. `main()` tests capture stdout/stderr and set env.
- `test/npm-install.test.js` is an integration test: it runs `npm pack`, installs
  the tarball into a throwaway global prefix, and runs the installed `pi-cli`
  bin. Keep it in sync when `files`, `bin`, or the entry point change. It skips
  when npm is missing and needs no network (zero dependencies).
- Run `node --test` before finishing; the suite is fast and must stay green.

## Documentation

Update `README.md` whenever user-facing behavior changes (flags, expansion
rules, config format, supported platforms). Keep `src/help.js` in sync with the
actual options, and add a usage example for any new flag.
