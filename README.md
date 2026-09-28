# @lglen/pi-command-cli

[![npm version](https://img.shields.io/npm/v/@lglen/pi-command-cli.svg?logo=npm)](https://www.npmjs.com/package/@lglen/pi-command-cli)
[![Downloads](https://img.shields.io/npm/dm/@lglen/pi-command-cli.svg?logo=npm)](https://www.npmjs.com/package/@lglen/pi-command-cli)
[![Build Status](https://github.com/LaishGlenberg/pi-command-cli/workflows/CI/badge.svg)](https://github.com/LaishGlenberg/pi-command-cli/actions)


A QoL wrapper around the 'pi' command for starting the pi coding agent. Primary feature is extension and skill name resolution, you no longer need to refer to them with absolute paths. Contains a lot of helpful abstractions such as:

- Automatically call `-ne` when using `-e` (same applies to `-s` with `-ns`)
- `-bt` / `--built-in-tools` to keep only chosen built-in tools while leaving extension tools enabled
- `-n` flag to kill ALL external context sources and tools
- `-S` and `--import` options for saving and loading pi-cli startup options
- `--config` to create an external JSONC/YAML config file that replaces `settings.json`
- `-cu` / `--custom` to expand user-defined `piCli.custom` fixtures into arguments

```bash
pi-cli -e pi-intercom
pi-cli -e pi-intercom "inspect this project"
pi-cli -e pi-intercom,pi-mcp-adapter
pi-cli -s playwright-cli
pi-cli -s playwright-cli,pi-intercom
pi-cli -e pi-intercom -bt bash,ls,grep
```

The equivalent Pi invocation for the first example is:

```bash
pi -ne --extension "$HOME/.pi/agent/npm/node_modules/pi-intercom"
```

## Install

From npm (global):

```bash
npm install -g @lglen/pi-command-cli
```

From a checkout (local development):

```bash
git clone https://github.com/LaishGlenberg/pi-command-cli.git
cd pi-command-cli
npm install
npm link
```

## Development and CI

Install the development dependencies and run the checks locally:

```bash
npm ci
npm test
npm run lint
npm run typecheck
npm run build
```

The sources and tests are TypeScript. `npm test` runs the `.ts` sources directly
using Node's built-in type stripping, so no build is needed for the inner loop.
`npm run build` compiles them to `dist/` for publishing, and `npm run typecheck`
checks types without emitting.

Linting uses [Oxlint](https://oxc.rs/docs/guide/usage/linter.html), configured
in `.oxlintrc.json` with its correctness rules enabled; warnings fail the check.
GitHub Actions runs tests, linting, type-checking, and the build on pushes and
pull requests to `main` with Node.js 24.

## Extensions / Skill Loading

Naming extensions only disables *extension* discovery, so your skills keep
loading. Naming skills only disables *skill* discovery, so your extensions keep
loading. Naming both disables both. Runs with no `-e`/`-s` flags are a
transparent pass-through to `pi` and add no discovery flags of their own.

`-e` and `-s` may be repeated or take comma-separated values. Detached
(`--extension name`), equals (`--extension=name`), and attached short
(`-ename`, `-e=name`) spellings are equivalent.

Extension names are searched in:

- `$PI_AGENT_DIR/npm/node_modules` (defaults to `~/.pi/agent`)
- `$PI_AGENT_DIR/git`
- `$PI_AGENT_DIR/extensions`

Skill names are searched in `$PI_AGENT_DIR/skills` and in extension trees for
`SKILL.md` files or skill directories containing `SKILL.md`.

`pi-cli -s playwright-cli` expands to:

```bash
pi -ns --skill "$HOME/.pi/agent/skills/playwright-cli.md"
```

`pi-cli -s pi-intercom` resolves the skill directory shipped by the extension.

## Built-in tools

`-bt` / `--built-in-tools` keeps only the built-in tools you name and disables the
rest, while leaving extension tools untouched. It expands to Pi's
`--exclude-tools` with every built-in you did *not* name:

```bash
pi-cli -e pi-intercom -bt bash,ls,grep
# equivalent to:
pi -ne --exclude-tools read,powershell,edit,write,find \
  --extension "$HOME/.pi/agent/npm/node_modules/pi-intercom"
```

Valid names are `read`, `bash`, `powershell`, `edit`, `write`, `grep`, `find`,
and `ls`. `-bt` is repeatable and accepts comma-separated values, `--built-in-tools=`,
and attached `-btread,bash` forms.

Unlike `-t` / `--tools` (which Pi applies as a strict allowlist across built-in,
extension, and custom tools, thereby disabling extension tools), `-bt` only
filters built-ins. Note that Pi enables only `read`, `bash`, `edit`, and `write`
by default; `grep`, `find`, and `ls` must be enabled first via the `defaultTools`
setting in `settings.json`, otherwise `-bt` cannot keep them active:

```json
{ "defaultTools": ["read", "bash", "edit", "write", "grep", "find", "ls"] }
```

Existing extension and skill paths continue to work. Use `--dry-run` to inspect
the expanded command, or `-n` / `--nothing` to start from a clean slate:

```bash
pi-cli -n
# equivalent to: pi -ne -ns -nc -np

pi-cli -n -e pi-intercom
# kills all extensions/skills/computer/playwright, then loads pi-intercom
```

Set `PI_BIN` to use a different Pi executable. Paths with spaces work on
Windows too (`C:\Program Files\...\pi.cmd`).

## Custom fixtures (`--custom`)

`piCli.custom` holds arbitrary JSON values — strings, arrays, or nested objects
— that you can reference from the command line or from saved configs. `-cu` /
`--custom` takes a small argument list in which any token may be an access path
into `piCli.custom`; each such token is replaced by the referenced value. It is
read from settings.json (or the top-level `custom` key of the external config
file):

```json
{
  "piCli": {
    "custom": {
      "sys_prompts": [
        "You are a reviewer agent. Delegate edits to a worker via pi-intercom."
      ],
      "ext_list": ["pi-intercom", "rtk", "todo"],
      "cheap_model": ["--model", "google/gemini"]
    }
  }
}
```

```bash
pi-cli -ns -bt grep,ls,bash \
  --custom '--system-prompt sys_prompts[0] -e ext_list[0]'
# expands to:
pi-cli -ns -bt grep,ls,bash \
  --system-prompt "You are a reviewer agent. ..." -e pi-intercom
```

Access paths use JavaScript-style syntax: `key`, `key[0]`, or
`key.nested['other']`. Strings are substituted as-is, arrays spread into
separate arguments, and objects/numbers/booleans are JSON-serialized. Multiple
references are allowed in one expression. Tokens that do not resolve are passed
through literally, and an expression that resolves nothing throws
`custom fixture not found`.

Expansion happens in the parser, not as plain text substitution: once the
fixture values are spliced in, the result is parsed exactly as if you had typed
those tokens on the command line. pi-cli flags inside a `--custom` expression
are therefore honored — `-e`/`--extension`, `-s`/`--skill`, `-bt`, even a nested
`--custom` — including the `-ne`/`-ns` discovery flags they imply. So
`--custom '-e ext_list[0]'` behaves like `-e pi-intercom` and resolves the
extension to its path. The `--custom` wrapper is removed, so it composes with
every other flag and with saved configs:

```json
{
  "piCli": {
    "agents": {
      "reviewer": "pi-cli -ns -e pi-intercom -bt grep,ls,bash --custom '--system-prompt sys_prompts[0]'"
    }
  }
}
```

## Save named configurations

Save named configurations and load them back:

```bash
pi-cli --save searcher -e pi-intercom -s playwright-cli
# or shorthand:
pi-cli -S searcher -e pi-intercom -s playwright-cli
pi-cli --import searcher
# -i searcher is an alias for --import searcher
```

When imported, the stored command is re-parsed from scratch, so extension and
skill names are resolved again. Import searches exact names first, then unique
partial matches (case-insensitive).

### Where configs are stored

pi-cli can keep saved configs in either of two places. The external config file
takes precedence whenever it exists:

1. **External config file** — `$PI_AGENT_DIR/extensions/pi-command-cli-config/`
   (defaults to `~/.pi/agent`); the first of `config.jsonc`, `config.json`,
   `config.yaml`, `config.yml` that exists is used. Supports JSONC comments and
   trailing commas, plus YAML.
2. **settings.json** — the `piCli` key of Pi's own settings file, used when no
   external config file exists.

Create the external file with:

```bash
pi-cli --config          # create config.jsonc
pi-cli --config --yaml   # create config.yaml instead
pi-cli --config --force  # overwrite an existing config file
```

Once the file exists, pi-cli reads *and* writes it, and never touches
`settings.json`. Delete the file to fall back to settings.json. External
configs look like this:

```jsonc
{
  // Saved command strings, written by `pi-cli --save <name> ...`.
  "agents": {
    "searcher": "pi-cli -e pi-intercom -s playwright-cli",
    "quick": "pi-cli --model google/gemini"
  },
  // Reserved for `--custom` fixtures.
  "custom": {}
}
```

```yaml
agents:
  searcher: pi-cli -e pi-intercom -s playwright-cli
custom: {}
```

The same content in settings.json (read only when no external file exists):

```json
{
  "piCli": {
    "agents": {
      "searcher": "pi-cli -e pi-intercom -s playwright-cli"
    }
  }
}
```

A nested `piCli` block inside the external file is also accepted, so the
settings.json block can be pasted in as-is. Configs stored as flat entries
directly under `piCli` (or at the top level of the external file) are still
read, but new saves always go to `agents`.

## Project structure

```
index.ts            Bin entry point (delegates to src/, re-exports the public API)
src/
  index.ts          Barrel re-export of the public API
  constants.ts      Shared constants (agent dir, settings filename, extensions)
  cli/
    main.ts         main() orchestration and child process spawning
    arguments.ts    CLI argument parsing, Pi argument building
    options.ts      Option table and matching
    config-cmd.ts   --config init mode
    custom.ts       --custom expansion into arguments
    help.ts         pi-cli --help output
    pi-help-msg.ts  pi --helpi output
  resolve/
    walk.ts         Safe recursive directory walker
    packages.ts     package.json reading and extension-directory detection
    matching.ts     Path canonicalization and name-matching helpers
    extensions.ts   Extension name resolution
    skills.ts       Skill name resolution
  config/
    file.ts         External config file (JSONC/YAML) discovery and parsing
    io.ts           Atomic, permissioned file writes
    settings.ts     Low-level settings.json read/write
    config.ts       Config store precedence + saved configs + custom fixtures
dist/               Compiled JavaScript published to npm (generated, gitignored)
```

## Windows

Windows is supported. npm installs `pi` as a `pi.cmd` shim, which Node cannot
spawn directly, so pi-cli runs the command through `cmd.exe` and quotes the
arguments itself. Prompts containing spaces, quotes, `&` or trailing
backslashes are passed through intact. The one caveat of going through
`cmd.exe`: a `%VAR%` pair in an argument is expanded, as it would be on any
cmd command line.

## Pi alias

I recommend aliasing pi-cli under pi, use `pi --helpi` to access pi's --help message

Git Bash / bash:

```bash
alias pi=pi-cli
```

PowerShell:

```powershell
Set-Alias pi pi-cli
```