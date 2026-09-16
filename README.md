# @lglen/pi-command-cli

A small quality-of-life wrapper for launching Pi sessions. It passes normal Pi
arguments through, adds `-ns -ne` for extension runs (or `-ns` for skill-only
runs), and lets resource flags use names instead of absolute paths.

```bash
pi-cli -e pi-intercom
pi-cli -e pi-intercom "inspect this project"
pi-cli -e pi-intercom -e pi-mcp-adapter
pi-cli -s playwright-cli
pi-cli -s pi-intercom
pi-cli -t read,bash
```

The equivalent Pi invocation for the first example is:

```bash
pi -ns -ne --extension "$HOME/.pi/agent/npm/node_modules/pi-intercom"
```

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
the expanded command, `--no-defaults` when Pi's normal discovery should
stay enabled, or `-n` / `--nothing` to start from a clean slate:

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

Configurations are stored as plain command strings, so you can edit them by
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

## Install

From npm (global):

```bash
npm install -g @lglen/pi-command-cli
```

From a checkout (local development):

```bash
npm link
```

Or run without installing:

```bash
npx @lglen/pi-command-cli -e pi-intercom
```

## Release

The package is published publicly under the `@lglen` scope (`publishConfig.access`
is set to `public`, so no `--access` flag is needed).

```bash
npm login          # once per machine
npm test
npm pack --dry-run # inspect the published file list
npm version patch  # or minor/major; bumps version and creates a git tag
npm publish        # add --otp=<code> when npm 2FA is enabled
git push --follow-tags
```
