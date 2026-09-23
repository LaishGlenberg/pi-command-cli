export function printHelp() {
  process.stdout.write(`Usage: pi-cli [options] [pi-options/messages...]\n\n`);
  process.stdout.write(`If you aliased pi-cli as pi and need pi help, run: pi --helpi\n\n`);
  process.stdout.write(`Runs pi with explicit resources and passes normal Pi arguments through.\n`);
  process.stdout.write(`It adds -ne when extensions are named and -ns when skills are named.\n`);
  process.stdout.write(`With no resources named it is equivalent to running pi directly.\n\n`);
  process.stdout.write(`Options:\n`);
  process.stdout.write(`  -e, --extension <name|path>  Load an extension (repeatable)\n`);
  process.stdout.write(`  -s, --skill <name|path>      Load a skill (repeatable)\n`);
  process.stdout.write(`  -t, --tools <tools>          Comma-separated tool allowlist\n`);
  process.stdout.write(`  -i, --import <search>        Load a saved configuration\n`);
  process.stdout.write(`  -S, --save <name>            Save this configuration and exit\n`);
  process.stdout.write(`  --no-defaults                Do not add default discovery flags\n`);
  process.stdout.write(`  --allow-discovery            Alias for --no-defaults\n`);
  process.stdout.write(`  -n, --nothing                Equivalent to "-ne -ns -nc -np"\n`);
  process.stdout.write(`  --dry-run                    Print the command without running pi\n`);
  process.stdout.write(`  -h, --help                   Show this help\n\n`);
  process.stdout.write(`Extension and skill search roots:\n`);
  process.stdout.write(`  $PI_AGENT_DIR/npm/node_modules (or ~/.pi/agent)\n`);
  process.stdout.write(`  $PI_AGENT_DIR/git\n`);
  process.stdout.write(`  $PI_AGENT_DIR/extensions\n`);
}
