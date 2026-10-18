// Deterministic synthetic exports for the WP2 contract. Test-only code: it may
// import the design fixture, while app/export must not. Seeded coordinates and
// provinces are independent, so this mode tests shape and capacity, not
// geography. See docs/plans/wp2-slice-3-generator.md.

import { DETECTIONS, type Detection as DesignDetection } from "../../app/design/detections.ts";
import { canonicalJson } from "../../app/export/canonical.ts";
import { contentHash, detectionId, exportId, sha256Hex } from "../../app/export/hash.ts";
import {
  CONFIDENCES,
  SATELLITES,
  SOURCE_IDS,
  WINDOW_MS,
  type Confidence,
  type DayNight,
  type Detection,
  type ExportCounts,
  type ExportV1,
  type HashableExport,
  type InvalidCounts,
  type Satellite,
  type SourceSnapshot,
} from "../../app/export/types.ts";

export const DEFAULT_SEED = 20261017;
export const REPRODUCTION_WINDOW_END = "2026-10-16T00:20:00Z";
export const REPRODUCTION_LAST_MODIFIED = "2026-10-16T00:10:00Z";
export const REPRODUCTION_MADE_AT = "2026-10-16T00:30:00Z";
export const SYNTHETIC_VERSION = "2.0NRT";

/** Explicit map, so a renamed design label fails loudly instead of drifting. */
export const PROVINCE_SLUGS = {
  "Kalimantan Tengah": "kalimantan-tengah",
  "Sumatra Selatan": "sumatra-selatan",
  Riau: "riau",
  "Kalimantan Barat": "kalimantan-barat",
  Jambi: "jambi",
  Papua: "papua",
} as const;

export type ProvinceCode = (typeof PROVINCE_SLUGS)[keyof typeof PROVINCE_SLUGS];

export const PROVISIONAL_PROVINCES: readonly ProvinceCode[] = Object.values(PROVINCE_SLUGS).sort();

export interface SyntheticOptions {
  seed?: number;
  rows?: number;
  windowEnd?: string;
  retrievedAt?: string;
  lastModified?: string;
  createdAt?: string;
  checkedAt?: string;
  provinces?: readonly ProvinceCode[];
}

const BOUNDARY = {
  name: "synthetic-provinces",
  version: "provisional",
  licence: "synthetic",
  sha256: sha256Hex(canonicalJson(PROVISIONAL_PROVINCES)),
};

const APPROVAL = { policy: "rules-v1", holds: [] as string[] };

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** `D` from 06:00 to 17:59 WIB, otherwise `N`. */
export function dayNightAt(iso: string): DayNight {
  const hour = new Date(Date.parse(iso) + WIB_OFFSET_MS).getUTCHours();
  return hour >= 6 && hour < 18 ? "D" : "N";
}

/** Reproduction mode: map the design detections to C2 without changing them. */
export function reproductionExport(): ExportV1 {
  const detections = DETECTIONS.map(mapDesignDetection).sort((left, right) =>
    compareText(left.id, right.id),
  );
  return buildExport({
    detections,
    windowEnd: REPRODUCTION_WINDOW_END,
    retrievedAt: REPRODUCTION_WINDOW_END,
    lastModified: REPRODUCTION_LAST_MODIFIED,
    createdAt: REPRODUCTION_MADE_AT,
    checkedAt: REPRODUCTION_MADE_AT,
  });
}

/** Seeded mode: arbitrary size with no design-data dependency at call time. */
export function seededExport(options: SyntheticOptions = {}): ExportV1 {
  const seed = options.seed ?? DEFAULT_SEED;
  const rows = options.rows ?? 60;
  const windowEnd = options.windowEnd ?? REPRODUCTION_WINDOW_END;
  const provinces = options.provinces ?? PROVISIONAL_PROVINCES;
  if (provinces.length === 0) throw new Error("Seeded export needs at least one province");
  if (!Number.isInteger(rows) || rows < 0)
    throw new Error("Seeded export rows must be a non-negative integer");

  const random = mulberry32(seed);
  const end = Date.parse(windowEnd);
  const latestMinute = WINDOW_MS / MINUTE_MS;
  const detections: Detection[] = [];

  for (let index = 0; index < rows; index += 1) {
    const satellite = SATELLITES[Math.floor(random() * SATELLITES.length)];
    const confidence = CONFIDENCES[Math.floor(random() * CONFIDENCES.length)] as Confidence;
    const province = provinces[Math.floor(random() * provinces.length)];
    const acquiredAt = new Date(end - Math.floor(random() * latestMinute) * MINUTE_MS)
      .toISOString()
      .slice(0, 19)
      .concat("Z");
    const latitude = round(-11 + random() * 17, 6);
    const longitude = round(95 + random() * 46, 6);
    const sourceId = SOURCE_IDS[satellite];

    detections.push({
      id: detectionId({ sourceId, acquiredAt, latitude, longitude }),
      sourceId,
      acquiredAt,
      latitude,
      longitude,
      satellite,
      confidence,
      daynight: dayNightAt(acquiredAt),
      province,
      version: SYNTHETIC_VERSION,
      frp: round(0.5 + random() * 49.5, 1),
      scan: round(0.3 + random() * 0.7, 3),
      track: round(0.3 + random() * 0.7, 3),
    });
  }

  return buildExport({
    detections,
    windowEnd,
    retrievedAt: options.retrievedAt ?? windowEnd,
    lastModified: options.lastModified ?? REPRODUCTION_LAST_MODIFIED,
    createdAt: options.createdAt ?? REPRODUCTION_MADE_AT,
    checkedAt: options.checkedAt ?? REPRODUCTION_MADE_AT,
  });
}

/** Stable file representation. Whitespace does not affect `contentHash`. */
export function serializeExport(document: ExportV1): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

interface BuildInput {
  detections: Detection[];
  windowEnd: string;
  retrievedAt: string;
  lastModified: string;
  createdAt: string;
  checkedAt: string;
}

function buildExport(input: BuildInput): ExportV1 {
  const detections = [...input.detections].sort((left, right) => compareText(left.id, right.id));
  const byProvince: Record<string, number> = {};
  for (const detection of detections) {
    byProvince[detection.province] = (byProvince[detection.province] ?? 0) + 1;
  }
  const sortedProvinces = Object.fromEntries(
    Object.entries(byProvince).sort(([left], [right]) => compareText(left, right)),
  );

  const rows = new Map<Satellite, number>([
    ["NOAA-20", 0],
    ["NOAA-21", 0],
  ]);
  for (const detection of detections) {
    rows.set(detection.satellite, (rows.get(detection.satellite) ?? 0) + 1);
  }

  const sources: SourceSnapshot[] = SATELLITES.map((satellite) => {
    const sourceId = SOURCE_IDS[satellite];
    const count = rows.get(satellite) ?? 0;
    return {
      sourceId,
      url: `synthetic://${sourceId}`,
      retrievedAt: input.retrievedAt,
      lastModified: input.lastModified,
      etag: null,
      sha256: sha256Hex(canonicalJson([sourceId, input.retrievedAt, count])),
      bytes: 128 + count * 120,
      rows: count,
      status: "ok",
    };
  });

  const counts: ExportCounts = {
    accepted: detections.length,
    duplicate: 0,
    outsideIndonesia: 0,
    outsideWindow: 0,
    invalid: zeroInvalid(),
    byProvince: sortedProvinces,
  };

  const hashable: HashableExport = {
    schemaVersion: 1,
    synthetic: true,
    createdAt: input.createdAt,
    windowEnd: input.windowEnd,
    windowHours: 72,
    checkedAt: input.checkedAt,
    sourceUpdatedAt: input.lastModified,
    latestObservationAt: detections.reduce<string | null>(
      (current, detection) =>
        current === null || detection.acquiredAt > current ? detection.acquiredAt : current,
      null,
    ),
    sources,
    boundary: BOUNDARY,
    approval: APPROVAL,
    counts,
    detections,
  };

  const hash = contentHash(hashable);
  return {
    schemaVersion: hashable.schemaVersion,
    exportId: exportId(hash),
    synthetic: hashable.synthetic,
    createdAt: hashable.createdAt,
    windowEnd: hashable.windowEnd,
    windowHours: hashable.windowHours,
    checkedAt: hashable.checkedAt,
    sourceUpdatedAt: hashable.sourceUpdatedAt,
    latestObservationAt: hashable.latestObservationAt,
    sources: hashable.sources,
    boundary: hashable.boundary,
    approval: hashable.approval,
    counts: hashable.counts,
    detections: hashable.detections,
    contentHash: hash,
  };
}

function mapDesignDetection(row: DesignDetection): Detection {
  const sourceId = SOURCE_IDS[row.satellite];
  return {
    id: detectionId({
      sourceId,
      acquiredAt: row.acquiredAt,
      latitude: row.latitude,
      longitude: row.longitude,
    }),
    sourceId,
    acquiredAt: row.acquiredAt,
    latitude: row.latitude,
    longitude: row.longitude,
    satellite: row.satellite,
    confidence: row.confidence,
    daynight: dayNightAt(row.acquiredAt),
    province: provinceCode(row.province),
    version: SYNTHETIC_VERSION,
    frp: null,
    scan: null,
    track: null,
  };
}

function provinceCode(name: string): ProvinceCode {
  const code = PROVINCE_SLUGS[name as keyof typeof PROVINCE_SLUGS];
  if (!code) throw new Error(`Unknown design province: ${name}`);
  return code;
}

function zeroInvalid(): InvalidCounts {
  return {
    badNumber: 0,
    badTime: 0,
    badConfidence: 0,
    badDaynight: 0,
    badSatellite: 0,
    badVersion: 0,
    outOfRegion: 0,
  };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** Deterministic 32-bit PRNG. No `Math.random()` in generation. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
