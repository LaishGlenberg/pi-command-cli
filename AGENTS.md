# AGENTS.md

Guidance for agents working in `@lglen/pi-command-cli` (`pi-cli`), a
zero-dependency Node CLI that wraps the `pi` coding agent: it resolves
extension/skill names to absolute paths, adds the right discovery flags, and
saves/loads named launch configs. Every other `pi` flag is a transparent
pass-through.

## Commands

```bash
node --test          # test suite (node:test) run directly on the .ts sources
npm test             # same as above
npm run typecheck    # tsc --noEmit (tsconfig.json)
npm run build        # compile to dist/ for publishing (tsconfig.build.json)
npm link             # expose `pi-cli` locally (prepare builds first)
pi-cli --dry-run ... # print the expanded `pi ...` command without spawning
```

TypeScript compiled by `tsc` to `dist/` (gitignored; `bin`/`main` point at
`dist/index.js`). No runtime deps, no bundler. Node >= 22.18, ESM. Tests run the
`.ts` sources via Node's native type stripping. `prepare` builds `dist/`, so a
fresh checkout needs no manual build.

## Layout

```
index.ts            Bin entry; runs main(), re-exports public API
src/index.ts        Barrel re-export of the public API (add exports here only)
src/constants.ts    Agent dir, config dir/file names, alias names, built-in tools
src/cli/            main, arguments/options, list, add-aliases, config-cmd, custom, help
src/resolve/        extension/skill name -> path (walk, packages, matching)
src/config/         config-file (paths/IO) + config (save/load) + aliases
test/index.test.ts        Most tests
test/config-path.test.ts  Config path/store and `--path` coverage
test/npm-install.test.ts  Pack/install integration test
```

Entry flow: `index.ts` -> `src/cli/main.ts#main` -> `src/cli/arguments.ts`.

## Behavior invariants

**Discovery flags** - naming a resource disables discovery for that type only:
`-e` adds `-ne`, `-s` adds `-ns`, neither adds nothing, `-n`/`--nothing` emits
explicit `-ne -ns -nc -np` with `useDefaults = false`. Do not add `-nbt` or other
tool flags here.

**`-bt`/`--built-in-tools`** keeps only the named built-ins by emitting
`--exclude-tools <BUILTIN_TOOLS minus allowlist>`. Never use `--tools`/`-t`
(strict allowlist across built-in/extension/custom tools; would disable the
extension tools `-e` loads). User-typed `--tools`/`-t` pass through unchanged.
Note `--exclude-tools` only removes; Pi's default built-ins are `read, bash,
edit, write`, so `grep`/`find`/`ls` need Pi's `settings.json` `defaultTools`
first.

**`--custom`** takes one argv element whose tokens may be JS-style access paths
(e.g. `sys_prompts[0]`, `opts.nested['x']`) into the config's top-level `custom`
map. `parseArguments` expands it, splices the result into the token stream, and
re-parses it as if typed on the CLI - so pi-cli flags inside `--custom` are
honored. Strings substitute as-is, arrays spread, other values JSON-serialize;
unresolved tokens pass through; an expression resolving nothing throws. After
`--`, arguments are literal and forwarded to pi.

**`-p`/`--path` and `--config`** - `-p <directory>` selects a config directory
and records it as top-level `path` in the default config, so later commands use
it; `--config` creates the default config file and exits.

**`-ls`/`--list` and `-aa`/`--add-aliases`** - `--list` prints saved agents and
custom fixtures (tolerating a missing file); `--add-aliases` regenerates
`aliases.sh` next to the config and offers to import it from the rc file.

**Config** lives at `~/.config/pi-cli/config.json`, a single JSON store separate
from Pi's `settings.json` (never touch it; no settings.json fallback). The
directory honors `$PI_CLI_CONFIG_DIR`, then `$XDG_CONFIG_HOME` (falling back to
`~/.config`); `$PI_CLI_CONFIG` overrides the whole file path. Saved commands live
under top-level `agents.<name>`; top-level `custom` is reserved and must be
preserved; top-level `path` records the `--path` directory. `loadConfig` on a
missing file throws `config file not found: <path>`; `loadCustomFixtures`,
`loadConfigListing`, and `--list` tolerate a missing file. Write atomically (temp
+ rename) with `0600`, preserving unrelated keys. Stored command strings are
tokenized with `shellSplit` (quote-aware) so a quoted `--custom` value
round-trips. Saving regenerates `aliases.sh` alongside the config.

## Conventions

- Plain ESM, named exports, no classes, no external deps. Prefer small pure
  functions for direct unit testing.
- Keep syntax erasable (`erasableSyntaxOnly`): no `enum`, `namespace`, or
  parameter properties. Relative imports use explicit `.ts` specifiers
  (`rewriteRelativeImportExtensions` rewrites them to `.js` in `dist/`).
- Errors: throw `Error` with a lowercase, actionable message including searched
  locations or the ambiguity list. `main()` prints `pi-cli: <message>` to stderr
  and returns exit code 1.
- Resolution stays deterministic: return an explicit path if it exists,
  otherwise search; on 0 or >1 matches throw rather than guess.
- Add public API to `src/index.ts` only (it re-exports with `export *`).
- Windows: never spawn a `.cmd` directly. Go through
  `buildSpawnSpec`/`windowsQuote` (cmd.exe `/d /s /c`) and keep the
  `windowsVerbatimArguments` option.
- The `build` script marks `dist/index.js` executable (`+x`); a bare `tsc` run
  skips this and the linked bin then fails with "Permission denied".

## Testing

- Tests live in `test/index.test.ts` (plus `test/config-path.test.ts` for config
  path resolution). Use `fixture()` for a fake agent dir and `withEnv` to set
  `PI_AGENT_DIR`/`PI_BIN`/`PI_CLI_CONFIG`; `index.test.ts` also sets a
  process-wide `PI_CLI_CONFIG_DIR`. Always point the config at a temp location;
  never touch the real config.
- Prefer asserting on `parseArguments`/`buildPiArguments` output over spawning
  pi. Use the `parsedArgs()` helper for `buildPiArguments`-only tests.
- `test/npm-install.test.ts` runs `npm pack` (builds `dist/` via `prepack`),
  installs the tarball into a throwaway global prefix, and runs the installed
  bin. Update it when `files`, `bin`, `main`, or the entry point change. It
  skips without npm and needs no network.
- Run `node --test` and `npm run typecheck` before finishing; keep both green.

## Docs

Update `README.md` for user-facing changes (flags, expansion rules, config
format, platforms) and keep `src/cli/help.ts` in sync, with a usage example for
any new flag.

## Releasing

CI (`.github/workflows/release.yml`) releases on every push to `main`: if the
tag for `package.json`'s version already exists it bumps the patch and commits
`chore(release): vX.Y.Z [skip ci]`, otherwise it tags the current version. The
version decision is the pure, tested `scripts/release-version.ts`. Never push
`v*` tags by hand. There is no `npm publish` step (publishing is manual).
