import { loadConfigListing, type ConfigListing } from "../config/config.ts";

const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

/**
 * Whether ANSI color should be used. Honors `NO_COLOR` and only colors a
 * terminal, so piping the listing to a file or another program stays clean.
 */
export function supportsColor(): boolean {
  if (process.env.NO_COLOR !== undefined) return false;
  return Boolean(process.stdout.isTTY);
}

export interface ListingFormatOptions {
  color?: boolean;
}

/**
 * Render the saved agents and custom fixtures. Each agent is shown as
 * `name: command`, and each fixture as `key: JSON value`. Names and keys are
 * painted yellow when `color` is set, and the two sections are separated by a
 * blank line.
 */
export function formatConfigListing(
  listing: ConfigListing,
  options: ListingFormatOptions = {},
): string {
  const { color = false } = options;
  const paint = (value: string): string => (color ? `${YELLOW}${value}${RESET}` : value);
  const section = (
    title: string,
    entries: [string, unknown][],
    format: (value: unknown) => string,
  ): string => {
    const lines =
      entries.length > 0
        ? entries.map(([key, value]) => `  ${paint(key)}: ${format(value)}`)
        : ["  (none)"];
    return [`${title}:`, ...lines].join("\n");
  };
  const stringify = (value: unknown): string => JSON.stringify(value) ?? String(value);
  return [
    section(
      "Agents",
      Object.entries(listing.agents),
      (value) => (typeof value === "string" ? value : stringify(value)),
    ),
    section("Custom", Object.entries(listing.custom), stringify),
  ].join("\n\n");
}

/** Print the saved agents and custom fixtures from pi-cli's config file. */
export function printConfigListing(configFilePath?: string): void {
  const listing = loadConfigListing(configFilePath);
  process.stdout.write(`${formatConfigListing(listing, { color: supportsColor() })}\n`);
}
