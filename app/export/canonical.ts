// Deterministic serialization for the export contract. Object keys are sorted,
// whitespace is removed, and equivalent numbers serialize identically, so the
// same fixed input always produces the same hash.

export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(serialize).join(",")}]`;
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return JSON.stringify(normalizeNumber(value));
    case "string":
      return JSON.stringify(value);
    case "object":
      return serializeObject(value as Record<string, unknown>);
    default:
      throw new TypeError("Canonical JSON cannot encode undefined, function, symbol, or bigint");
  }
}

function serialize(value: unknown): string {
  return canonicalJson(value);
}

function serializeObject(record: Record<string, unknown>): string {
  const fields = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${fields.join(",")}}`;
}

/** Normalize a number so `-0` serializes as `0`; reject values JSON cannot hold. */
export function normalizeNumber(value: number): number {
  if (!Number.isFinite(value)) {
    throw new TypeError("Canonical JSON cannot encode a non-finite number");
  }
  return Object.is(value, -0) ? 0 : value;
}

const SECOND_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const MINUTE_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/;

/**
 * Contract timestamps are ISO UTC at second precision. The round trip rejects
 * calendar overflow such as 31 February, which `Date.parse` would roll over.
 */
export function isUtcSecond(value: string): boolean {
  if (!SECOND_UTC.test(value)) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  return new Date(parsed).toISOString().slice(0, 19) + "Z" === value;
}

/** C2 acquisition times use minute precision with zero seconds. */
export function isUtcMinute(value: string): boolean {
  if (!MINUTE_UTC.test(value)) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  return new Date(parsed).toISOString().slice(0, 16) + ":00Z" === value;
}

export function utcMilliseconds(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`Invalid UTC timestamp: ${value}`);
  return parsed;
}
