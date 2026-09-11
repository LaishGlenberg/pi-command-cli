# pi-command-cli

A small quality-of-life wrapper for launching Pi sessions. It passes normal Pi
arguments through, adds `-ns -ne` for extension runs (or `-ns` for skill-only
runs), and lets resource flags use names instead of absolute paths.

```bash
pi-cli -e pi-intercom
pi-cli -e pi-intercom "inspect this project"
pi-cli -e pi-intercom -e pi-mcp-adapter
pi-cli -s playwright-cli
pi-cli -s pi-intercom
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
the expanded command, and `--no-defaults` when Pi's normal discovery should
stay enabled. Set `PI_BIN` to use a different Pi executable.

Install the command locally with:

```bash
npm link
```
