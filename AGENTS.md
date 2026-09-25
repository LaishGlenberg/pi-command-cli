# AGENTS.md

Guidance for agents working in `@lglen/pi-command-cli` (`pi-cli`).

## What this project is

A small zero-dependency Node CLI that wraps the `pi` coding agent. Its job is to
make `pi` startup ergonomic: resolve extension and skill names to absolute paths,
add the right discovery flags, and save/load named launch configs. It is a
transparent pass-through for every other `pi` flag.

## Commands

```bash
npm test             # run the test suite (127 tests, node:test) on the .ts sources
npm run typecheck    # tsc --noEmit (tsconfig.json)
npm run build        # compile to dist/ for publishing (tsconfig.build.json)
npm link             # expose `pi-cli` locally (the prepare script builds first)
pi-cli --dry-run ... # print the expanded `pi ...` command without spawning
```

Written in TypeScript and compiled with `tsc` to `dist/` for publishing; there
are no runtime dependencies and no bundler. Node >= 22.18, ESM
(`"type": "module"`). Tests run the `.ts` sources directly through Node's native
type stripping and use the built-in `node:test` + `node:assert/strict` only.
`dist/` is generated and gitignored; `bin`/`main` point at `dist/index.js`. The
`prepare` script builds `dist/` on `npm install`/`npm link`, so a fresh checkout
is runnable without a manual build.

## Architecture

Entry flow: `index.ts` (bin) → `src/cli/main.ts#main` → `src/cli/arguments.ts`.

```
index.ts            Bin entry; runs main() when invoked directly, re-exports public API
src/
  index.ts          Barrel re-export of the public API (public surface lives here)
  constants.ts      Agent dir, settings filename, piCli key, source extensions
  cli/
    main.ts         main() orchestration, shell/Windows quoting, child spawn
    arguments.ts    stripSaveFlag/merge + parseArguments/buildPiArguments + shellSplit
    options.ts      Option table (FLAG_OPTIONS/VALUE_OPTIONS) + matchOption + -bt validation
    custom.ts       --custom access-path lookup and expansion
    help.ts         `pi-cli --help` text
    pi-help-msg.ts  `pi-cli --helpi` text (pi's own help; keep roughly in sync with pi)
  resolve/
    walk.ts         Recursive directory walker (skips node_modules/.git, symlink-safe)
    packages.ts     package.json parsing and "is this a pi extension dir" checks
    matching.ts     Path canonicalization and name-matching helpers
    extensions.ts   Extension name → path resolution
    skills.ts       Skill name → path resolution
  config/
    settings.ts     Atomic, permissioned settings.json read/write
    config.ts       saveConfig/loadConfig on top of settings.ts (+ piCli.custom)
test/index.test.ts  All tests
dist/               `tsc` output (generated, gitignored) that npm publishes

graphify-out/        Committed knowledge graph of this repo (see below)
```

### Core flow

1. `parseArguments(argv, custom)` walks argv left to right. pi-cli's own flags
   are declared in one option table (`FLAG_OPTIONS` / `VALUE_OPTIONS` in
   (`options.ts`) and matched by `matchOption`, which understands detached
   (`--flag value`), equals (`--flag=value`), and attached short (`-fvalue`,
   `-f=value`) spellings. The handled flags are `-e`, `-s`,
   `-bt`/`--built-in-tools`, `-cu`/`--custom`, `-i`/`--import`, `-S`/`--save`,
   `-n`/`--nothing`, `--no-defaults`, `--dry-run`, and help; everything else is
   pushed untouched into `piArguments`. `-e`/`-s` normalize to
   `--extension <value>` / `--skill <value>` pairs. `custom` is either a
   fixtures object or a lazy `() => fixtures` loader.
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

### Custom fixtures (`--custom`)

`piCli.custom` holds arbitrary JSON. `-cu`/`--custom` takes one argv element
containing an argument list in which any token may be a JavaScript-style access
path (e.g. `sys_prompts[0]`, `opts.nested['x']`) into `piCli.custom`.
`parseArguments` expands it against the fixtures, **splices the result into the
token stream, and re-parses it as if typed on the command line** — so pi-cli
flags inside a `--custom` expression (`-e`, `-s`, `-bt`, nested `--custom`, …)
are honored, including the discovery flags they imply. Strings substitute as-is,
arrays spread into separate args, other values are JSON-serialized; multiple
references are allowed, unresolved tokens pass through, and an expression that
resolves nothing throws. `buildPiArguments` no longer handles `--custom`; after
`--` the wrapper is a literal argument forwarded to pi.

### Saved config storage

Saved commands live under `piCli.agents.<name>`; `piCli.custom` is reserved and
must be preserved. `loadConfig` also reads legacy flat `piCli.<name>` entries.
Stored command strings are tokenized with `shellSplit` (quote-aware) so a quoted
`--custom` value round-trips.

## Conventions

- Plain ESM, named exports, no classes, no external deps. Prefer small pure
  functions so they can be unit-tested directly.
- TypeScript is compiled but the `.ts` sources are also run directly by Node, so
  keep syntax erasable (`tsconfig.json` sets `erasableSyntaxOnly`): no `enum`,
  `namespace`, or parameter properties. Relative imports use explicit `.ts`
  specifiers; `rewriteRelativeImportExtensions` rewrites them to `.js` in
  `dist/`.
- Errors: throw `Error` with a lowercase, actionable message that includes the
  searched locations or the ambiguity list. `main()` catches and prints
  `pi-cli: <message>` to stderr, returning exit code 1.
- Resolution must stay deterministic: return an explicit path if it exists,
  otherwise search, and on 0 or >1 matches throw rather than guess.
- Add public API to `src/index.ts` only; `index.ts` re-exports it with
  `export *`, so the two lists cannot drift.
- Windows matters: never spawn a `.cmd` directly. Route through
  `buildSpawnSpec`/`windowsQuote` (cmd.exe `/d /s /c`) and keep the
  `windowsVerbatimArguments` option.
- The `build` script marks `dist/index.js` executable: `tsc` emits it `0644`,
  but a globally linked `pi-cli` runs the file through its shebang and needs
  `+x`. A bare `tsc` run that skips this step will make the linked bin fail
  with "Permission denied".
- `settings.json` is shared with pi. Only touch the `piCli` key (`piCli.agents`
  for saved commands; never clobber `piCli.custom`), write atomically (temp +
  rename) with `0600`, and preserve unrelated keys.

## Releasing

Releases are cut entirely in CI by `.github/workflows/release.yml`, which runs
on every push to `main`:

- If `package.json`'s version changed in the push (a deliberate minor/major bump
  made in the merged PR), that version is released as-is.
- Otherwise the workflow bumps the patch version, commits it back to `main` as
  `chore(release): vX.Y.Z [skip ci]`, and tags that commit.

The tag is created in GitHub on a commit that is actually on `main`; never push
`v*` tags by hand. There is no `npm publish` step (npm disallows publishing via
`GITHUB_TOKEN`), so publishing stays manual. The version decision is a pure
function in `scripts/release-version.ts`, unit-tested in
`test/release-version.test.ts`, so the workflow logic stays testable. A bump
commit is pushed with `GITHUB_TOKEN`, which does not retrigger workflows, so
the workflow cannot loop on its own commit.

## Knowledge graph (graphify)

`graphify-out/` is a checked-in knowledge graph of this repo, built with the
`graphify` skill (`~/.pi/agent/skills/graphify/SKILL.md`, binary at
`~/.local/bin/graphify`). It is not build output to ignore — treat it as a
committed artifact.

- **Query before grepping.** For architecture questions ("what calls X",
  "how does resolution flow"), use the graph first: the `graphify` skill, or
  `graphify query "<question>"` / `graphify god-nodes`.
- **Scope with `.graphifyignore`.** The repo-root `.graphifyignore` (gitignore
  syntax, applied on top of `.gitignore`) currently excludes `test/` and `*.md`
  so the graph stays code-only and `graphify update` needs no LLM. Edit it to
  change what is graphed, then rerun `graphify update .` to apply.
- **Refresh after meaningful changes.** Run the graphify skill with `--update`
  (e.g. `/graphify . --update`) after adding/moving files or changing module
  structure, then commit the regenerated artifacts. Pure code changes are
  re-extracted via AST with no LLM; doc/README changes also refresh semantic
  nodes.
- **Pending refresh:** the TypeScript migration renamed every source file from
  `.js` to `.ts`; run `graphify update .` and commit the regenerated artifacts
  when convenient (intentionally deferred during the migration).
- **Tracked:** `graph.json`, `GRAPH_REPORT.md`, `graph.html`, `manifest.json`,
  `.graphify_labels.json`.
- **Ignored (machine-specific):** `cache/`, `memory/`, `reflections/`,
  `cost.json`, `.vocab.txt`, `.graphify_python`, `.graphify_root`,
  `.graphify_labels.json.sig`, dated pre-overwrite snapshots
  (`graphify-out/YYYY-MM-DD/`), and `.graphify_learning.json`. Never commit these.
- The generated `GRAPH_REPORT.md` (and its "surprising connections" /
  suggested-questions heuristics) is not actively maintained; prefer querying
  `graph.json`. Use `graphify update .` for the no-LLM code re-extraction.
- `manifest.json` stores per-file `ast_hash`/`semantic_hash` used for
  incremental updates. Don't hand-edit it or the graph; regenerate instead.

## Testing

- Add tests to `test/index.test.ts`. Use the `fixture()` helper to build a fake
  agent dir (npm/git/extensions/skills trees) and `withEnv` to set
  `PI_AGENT_DIR` / `PI_BIN`.
- Prefer asserting on `parseArguments` output and `buildPiArguments` output
  rather than spawning pi. `parseArguments(argv, custom)` takes fixture data (or
  a loader) for `--custom` tests. `main()` tests capture
  stdout/stderr and set env. For `buildPiArguments`-only tests, use the
  `parsedArgs()` helper instead of hand-writing every `ParsedArguments` field.
- `test/npm-install.test.ts` is an integration test: it runs `npm pack` (which
  builds `dist/` via `prepack`), installs the tarball into a throwaway global
  prefix, and runs the installed `pi-cli` bin. It is the check that the compiled
  artifact actually ships. Keep it in sync when `files`, `bin`, `main`, or the
  entry point change. It skips when npm is missing and needs no network (zero
  dependencies).
- Run `node --test` and `npm run typecheck` before finishing; the suite is fast
  and must stay green.

## Documentation

Update `README.md` whenever user-facing behavior changes (flags, expansion
rules, config format, supported platforms). Keep `src/cli/help.ts` in sync with the
actual options, and add a usage example for any new flag.
