/**
 * Expansion of `--custom` expressions against the user's `piCli.custom`
 * fixtures. A token may be a JavaScript-style access path such as
 * `sys_prompts[0]` or `config.options.deep`; anything that is not a valid
 * access path is treated as a literal argument.
 */

export type CustomFixtures = Record<string, unknown>;

type AccessSegment = string | number;

type LookupResult = { found: true; value: unknown } | { found: false };

/**
 * Parse an access path into segments. Returns `null` when the token is not a
 * valid access path, which lets callers treat it as a literal argument.
 */
function parseAccessPath(path: string): AccessSegment[] | null {
  const headMatch = /^[A-Za-z_$][\w$]*/.exec(path);
  const [head] = headMatch ?? [];
  if (head === undefined) return null;

  const segments: AccessSegment[] = [head];
  let rest = path.slice(head.length);

  while (rest.length > 0) {
    if (rest.startsWith(".")) {
      const match = /^\.([A-Za-z_$][\w$]*)/.exec(rest);
      const [whole, key] = match ?? [];
      if (whole === undefined || key === undefined) return null;
      segments.push(key);
      rest = rest.slice(whole.length);
      continue;
    }

    if (rest.startsWith("[")) {
      const end = rest.indexOf("]");
      if (end === -1) return null;
      const inner = rest.slice(1, end).trim();
      if (/^\d+$/.test(inner)) {
        segments.push(Number(inner));
      } else if (/^(["']).*\1$/.test(inner)) {
        segments.push(inner.slice(1, -1));
      } else {
        return null;
      }
      rest = rest.slice(end + 1);
      continue;
    }

    return null;
  }

  return segments;
}

function lookupCustom(custom: CustomFixtures, token: string): LookupResult {
  const segments = parseAccessPath(token);
  if (!segments) return { found: false };

  let value: unknown = custom;
  for (const segment of segments) {
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, segment)) {
      return { found: false };
    }
    value = (value as Record<AccessSegment, unknown>)[segment];
  }
  return { found: true, value };
}

function serializeCustomValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function customValueToArguments(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(serializeCustomValue);
  return [serializeCustomValue(value)];
}

/**
 * Expand a `--custom` expression against the user's `piCli.custom` fixtures.
 * The expression is a small argument list in which any token may be an access
 * path such as `sys_prompts[0]`; each such token is replaced by the referenced
 * value. Strings pass through, arrays spread into separate arguments, and
 * other values are JSON-serialized. Multiple references are allowed; the
 * expression must reference at least one fixture or it is treated as a typo.
 */
export function resolveCustomExpression(
  expression: string,
  custom: CustomFixtures = {},
): string[] {
  if (expression.trim() === "") {
    throw new Error("--custom requires a value");
  }

  const resolved: string[] = [];
  let references = 0;

  // The shell already stripped the outer quotes, so the expression is a single
  // argv element. Split on whitespace without re-interpreting inner quotes;
  // bracket-quoted access keys like `obj['prompt']` are part of the path.
  for (const token of expression.trim().split(/\s+/)) {
    const lookup = lookupCustom(custom, token);
    if (!lookup.found) {
      resolved.push(token);
      continue;
    }
    references += 1;
    resolved.push(...customValueToArguments(lookup.value));
  }

  if (references === 0) {
    throw new Error(`custom fixture not found: ${expression}`);
  }
  return resolved;
}
