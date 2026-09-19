# @lglen/pi-command-cli

A QoL wrapper around the 'pi' command for starting the pi coding agent. Primary feature is extension and skill name resolution, you no longer need to refer to them with absolute paths. Contains a lot of helpful abstractions such as:

- Automatically call `-ne` when using `-e` (same applies to `-s` with `-ns`, and `-t` with `-nbt`)
- `-n` flag to kill ALL external context sources and tools
- `-S` and `--import` options for saving and loading pi-cli startup options

```bash
pi-cli -e pi-intercom
pi-cli -e pi-intercom "inspect this project"
pi-cli -e pi-intercom,pi-mcp-adapter
pi-cli -s playwright-cli
pi-cli -s playwright-cli,pi-intercom
pi-cli -t read,bash # manage non built in tools with -e
```

The equivalent Pi invocation for the first example is:

```bash
pi -ne --extension "$HOME/.pi/agent/npm/node_modules/pi-intercom"
```

Naming extensions only disables *extension* discovery, so your skills keep
loading. Naming skills only disables *skill* discovery, so your extensions keep
loading. Naming both disables both. Runs with no `-e`/`-s` flags are a
transparent pass-through to `pi` and add no discovery flags of their own.

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

Existing extension and skill paths continue to work. Use `--dry-run` to inspect
the expanded command, or `-n` / `--nothing` to start from a clean slate:

```bash
pi-cli -n
# equivalent to: pi -ne -ns -nc -np

pi-cli -n -e pi-intercom
# kills all extensions/skills/computer/playwright, then loads pi-intercom
```

Set `PI_BIN` to use a different Pi executable.

Save named configurations in `~/.pi/agent/settings.json` (the same file Pi
uses for its own settings, under a `piCli` key):

```bash
pi-cli --save searcher -e pi-intercom -s playwright-cli
# or shorthand:
pi-cli -S searcher -e pi-intercom -s playwright-cli
pi-cli --import searcher
# -i searcher is an alias for --import searcher
```

Configurations are stored as plain command strings in settings.json, so you can edit them by
hand:

```json
{
  "piCli": {
    "searcher": "pi-cli -e pi-intercom -s playwright-cli",
    "quick": "pi-cli --model google/gemini"
  }
}
```

When imported, the stored command is re-parsed from scratch, so extension and
skill names are resolved again. Import searches exact names first, then unique
partial matches (case-insensitive).

## Project structure

```
index.js            Bin entry point (delegates to src/, re-exports the public API)
src/
  index.js          Barrel re-export of the public API
  constants.js      Shared constants (agent dir, settings filename, extensions)
  walk.js           Safe recursive directory walker
  packages.js       package.json reading and extension-directory detection
  matching.js       Path canonicalization and name-matching helpers
  extensions.js     Extension name resolution
  skills.js         Skill name resolution
  settings.js       Low-level settings.json read/write
  config.js         Saved pi-cli configurations (saveConfig/loadConfig)
  arguments.js      CLI argument parsing and Pi argument building
  help.js           pi-cli --help output
  pi-help-msg.js    pi --helpi output
  cli.js            main() orchestration and child process spawning
```

## Install

From npm (global):

```bash
npm install -g @lglen/pi-command-cli
```

From a checkout (local development):

```bash
npm link
```

## Pi alias

I recommend aliasing pi-cli under pi, use `pi --helpi` to access pi's --help message