# pi-command-cli

A small quality-of-life wrapper for launching Pi sessions. It passes normal Pi
arguments through, adds `-ns -ne` by default, and lets extension flags use a
package or extension name instead of an absolute path.

```bash
pi-cli -e pi-intercom
pi-cli -e pi-intercom "inspect this project"
pi-cli -e pi-intercom -e pi-mcp-adapter
```

The equivalent Pi invocation for the first example is:

```bash
pi -ns -ne --extension "$HOME/.pi/agent/npm/node_modules/pi-intercom"
```

Extension names are searched in:

- `$PI_AGENT_DIR/npm/node_modules` (defaults to `~/.pi/agent`)
- `$PI_AGENT_DIR/git`
- `$PI_AGENT_DIR/extensions`

Existing extension paths continue to work. Use `--dry-run` to inspect the
expanded command, and `--no-defaults` when Pi's normal discovery should stay
enabled. Set `PI_BIN` to use a different Pi executable.

Install the command locally with:

```bash
npm link
```
