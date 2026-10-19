// Local seed of NASA FIRMS VIIRS NRT detections over Indonesia. A satellite
// detection is not a confirmed fire. The seed is for local inspection only: no
// page, build, or test reads it. Field rules follow C1 and C2 in
// docs/plans/reliable-satellite-release.md. That plan is still a proposal.
import { join } from "node:path";
import { type Outlines, inIndonesia, readOutlines } from "./boundary.ts";
import { type Fetch, download, sha256, writeFileAtomic } from "./files.ts";

export const FIRMS_HEADER =
  "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight";

export interface FirmsSource {
  sourceId: string;
  satellite: "NOAA-20" | "NOAA-21";
  codes: readonly string[];
  url: string;
}

// Keyless regional 7-day files, access method A in the satellite-release plan.
export const FIRMS_SOURCES: readonly FirmsSource[] = [
  {
    sourceId: "firms-viirs-noaa20-c2-nrt",
    satellite: "NOAA-20",
    codes: ["N20", "1"],
    url: "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_SouthEast_Asia_7d.csv",
  },
  {
    sourceId: "firms-viirs-noaa21-c2-nrt",
    satellite: "NOAA-21",
    codes: ["N21", "2"],
    url: "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_SouthEast_Asia_7d.csv",
  },
];

export const FIRMS_ATTRIBUTION =
  "We acknowledge the use of data and/or imagery from NASA's Fire Information for Resource Management System (FIRMS), part of NASA's Earth Science Data and Information System (ESDIS). Check the exact text before public use.";

const CONFIDENCE = {
  low: "rendah",
  l: "rendah",
  nominal: "nominal",
  n: "nominal",
  high: "tinggi",
  h: "tinggi",
} as const;

export interface SeedDetection {
  id: string;
  sourceId: string;
  acquiredAt: string;
  latitude: number;
  longitude: number;
  satellite: "NOAA-20" | "NOAA-21";
  confidence: "rendah" | "nominal" | "tinggi";
  daynight: "D" | "N";
  version: string;
  frp: number;
  scan: number;
  track: number;
  brightTi4: number;
  brightTi5: number;
}

export interface SourceSnapshot {
  source: FirmsSource;
  body: Uint8Array;
  retrievedAt: string;
  etag: string | null;
  lastModified: string | null;
}

export interface FirmsSeed {
  kind: "kawal-local-seed/firms";
  schemaVersion: 1;
  synthetic: false;
  notice: string;
  attribution: string;
  createdAt: string;
  windowEnd: string;
  windowHours: number;
  earliestObservationAt: string | null;
  latestObservationAt: string | null;
  sources: {
    sourceId: string;
    url: string;
    retrievedAt: string;
    lastModified: string | null;
    etag: string | null;
    sha256: string;
    bytes: number;
    rows: number;
  }[];
  boundary: Outlines["source"] & { bufferKm: number };
  counts: {
    rows: number;
    invalid: Record<string, number>;
    outsideWindow: number;
    outsideIndonesia: number;
    duplicate: number;
    accepted: number;
  };
  detections: SeedDetection[];
}

const DECIMAL = /^-?\d+(\.\d+)?$/;

function number(text: string): number | null {
  if (!DECIMAL.test(text)) return null;
  const value = Number(text);
  return Object.is(value, -0) ? 0 : value;
}

/** Normalize one CSV row, or return the reason that it is invalid. */
export function normalizeRow(
  source: FirmsSource,
  fields: readonly string[],
  retrievedAtMs: number,
): SeedDetection | { invalid: string } {
  if (fields.length !== 13) return { invalid: "columns" };
  const [
    lat,
    lon,
    ti4,
    scanText,
    trackText,
    date,
    time,
    satellite,
    confidence,
    version,
    ti5,
    frpText,
    daynight,
  ] = fields;
  const latitude = number(lat);
  const longitude = number(lon);
  if (
    latitude === null ||
    longitude === null ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return { invalid: "coordinates" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,4}$/.test(time)) return { invalid: "time" };
  const hhmm = time.padStart(4, "0");
  const acquiredAt = `${date}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`;
  const at = Date.parse(acquiredAt);
  if (!Number.isFinite(at) || new Date(at).toISOString() !== acquiredAt.replace("Z", ".000Z")) {
    return { invalid: "time" };
  }
  if (at > retrievedAtMs + 10 * 60_000) return { invalid: "future" };
  if (!source.codes.includes(satellite)) return { invalid: "satellite" };
  const level = CONFIDENCE[confidence.toLowerCase() as keyof typeof CONFIDENCE];
  if (!level) return { invalid: "confidence" };
  if (!/^2\.\d+NRT$/.test(version)) return { invalid: "version" };
  if (daynight !== "D" && daynight !== "N") return { invalid: "daynight" };
  const values = [ti4, scanText, trackText, ti5, frpText].map(number);
  if (values.some((value) => value === null)) return { invalid: "number" };
  const [brightTi4, scan, track, brightTi5, frp] = values as number[];
  return {
    id: sha256(JSON.stringify([source.sourceId, acquiredAt, latitude, longitude])),
    sourceId: source.sourceId,
    acquiredAt,
    latitude,
    longitude,
    satellite: source.satellite,
    confidence: level,
    daynight,
    version,
    frp,
    scan,
    track,
    brightTi4,
    brightTi5,
  };
}

function lines(snapshot: SourceSnapshot): string[] {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(snapshot.body);
  } catch {
    throw new Error(`${snapshot.source.sourceId} is not valid UTF-8`);
  }
  const rows = text.split(/\r?\n/);
  if (rows.at(-1) === "") rows.pop();
  if (rows[0]?.replace(/^\uFEFF/, "") !== FIRMS_HEADER) {
    throw new Error(`${snapshot.source.sourceId} has an unexpected CSV header`);
  }
  return rows.slice(1);
}

/**
 * Build the seed from complete source files. Each row is counted once, in this
 * order: invalid, outside the window, outside Indonesia, duplicate, accepted.
 * A repeated key with different values stops the seed.
 */
export function buildFirmsSeed(
  snapshots: readonly SourceSnapshot[],
  outlines: Outlines,
  options: { windowHours: number; bufferKm: number; createdAt: string },
): FirmsSeed {
  if (!snapshots.length) throw new Error("No FIRMS source");
  const windowEndMs = Math.min(
    ...snapshots.map(({ retrievedAt }) => Math.floor(Date.parse(retrievedAt) / 1000) * 1000),
  );
  const windowStartMs = windowEndMs - options.windowHours * 3_600_000;
  const counts: FirmsSeed["counts"] = {
    rows: 0,
    invalid: {},
    outsideWindow: 0,
    outsideIndonesia: 0,
    duplicate: 0,
    accepted: 0,
  };
  const accepted = new Map<string, SeedDetection>();
  const conflicts: string[] = [];
  const sources: FirmsSeed["sources"] = [];
  for (const snapshot of snapshots) {
    const rows = lines(snapshot);
    const retrievedAtMs = Date.parse(snapshot.retrievedAt);
    sources.push({
      sourceId: snapshot.source.sourceId,
      url: snapshot.source.url,
      retrievedAt: snapshot.retrievedAt,
      lastModified: snapshot.lastModified,
      etag: snapshot.etag,
      sha256: sha256(snapshot.body),
      bytes: snapshot.body.length,
      rows: rows.length,
    });
    for (const row of rows) {
      counts.rows++;
      const result = normalizeRow(snapshot.source, row.split(","), retrievedAtMs);
      if ("invalid" in result) {
        counts.invalid[result.invalid] = (counts.invalid[result.invalid] ?? 0) + 1;
        continue;
      }
      const at = Date.parse(result.acquiredAt);
      if (at <= windowStartMs || at > windowEndMs) {
        counts.outsideWindow++;
        continue;
      }
      if (!inIndonesia(outlines, result.longitude, result.latitude, options.bufferKm)) {
        counts.outsideIndonesia++;
        continue;
      }
      const previous = accepted.get(result.id);
      if (!previous) {
        accepted.set(result.id, result);
        counts.accepted++;
      } else if (JSON.stringify(previous) === JSON.stringify(result)) {
        counts.duplicate++;
      } else {
        conflicts.push(result.id);
      }
    }
  }
  if (conflicts.length) {
    throw new Error(
      `${conflicts.length} repeated detection keys have different values; first ${conflicts[0]}`,
    );
  }
  const detections = [...accepted.values()].sort(
    (a, b) => b.acquiredAt.localeCompare(a.acquiredAt) || a.id.localeCompare(b.id),
  );
  return {
    kind: "kawal-local-seed/firms",
    schemaVersion: 1,
    synthetic: false,
    notice:
      "Local seed only. A satellite detection is not a confirmed fire. Do not commit, publish, or use this file in tests or builds.",
    attribution: FIRMS_ATTRIBUTION,
    createdAt: options.createdAt,
    windowEnd: new Date(windowEndMs).toISOString(),
    windowHours: options.windowHours,
    earliestObservationAt: detections.at(-1)?.acquiredAt ?? null,
    latestObservationAt: detections[0]?.acquiredAt ?? null,
    sources,
    boundary: { ...outlines.source, bufferKm: options.bufferKm },
    counts,
    detections,
  };
}

export const FIRMS_SEED_FILE = "firms/viirs-indonesia-7d.json";

/** Download both 7-day files, build the seed, then replace the local files. */
export async function runFirmsSeed(options: {
  outDir: string;
  fetch?: Fetch;
  now?: () => Date;
  sources?: readonly FirmsSource[];
  outlines?: Outlines;
  windowHours?: number;
  bufferKm?: number;
}): Promise<FirmsSeed> {
  const {
    outDir,
    fetch = globalThis.fetch,
    now = () => new Date(),
    sources = FIRMS_SOURCES,
    windowHours = 168,
    bufferKm = 10,
  } = options;
  const snapshots: SourceSnapshot[] = [];
  for (const source of sources) {
    const file = await download(fetch, source.url, { now });
    snapshots.push({
      source,
      body: file.body,
      retrievedAt: file.retrievedAt,
      etag: file.etag,
      lastModified: file.lastModified,
    });
  }
  const seed = buildFirmsSeed(snapshots, options.outlines ?? readOutlines(), {
    windowHours,
    bufferKm,
    createdAt: now().toISOString(),
  });
  for (const snapshot of snapshots) {
    const name =
      new URL(snapshot.source.url).pathname.split("/").at(-1) ?? snapshot.source.sourceId;
    writeFileAtomic(join(outDir, "firms/raw", name), snapshot.body);
  }
  writeFileAtomic(join(outDir, FIRMS_SEED_FILE), formatSeed(seed));
  return seed;
}

/** Pretty metadata with one detection per line, so the file is easy to search. */
export function formatSeed(seed: FirmsSeed): string {
  const { detections, ...head } = seed;
  const rows = detections.map((detection) => `    ${JSON.stringify(detection)}`).join(",\n");
  const list = rows ? `[\n${rows}\n  ]` : "[]";
  return `${JSON.stringify(head, null, 2).replace(/\n}$/, `,\n  "detections": ${list}\n}`)}\n`;
}
