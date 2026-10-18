// Contract tests for WP2 slice 1: canonical serialization and hashing. See
// docs/plans/wp2-export-contract.md. No generator or validator exists yet.
import { describe, expect, test } from "vite-plus/test";

import { canonicalJson, isUtcMinute, isUtcSecond } from "../app/export/canonical.ts";
import { contentHash, detectionId, exportId } from "../app/export/hash.ts";
import {
  SOURCE_IDS,
  type Detection,
  type HashableExport,
  type SourceSnapshot,
} from "../app/export/types.ts";

const WINDOW_END = "2026-10-16T00:30:00Z";
const ACQUIRED_AT = "2026-10-15T18:36:00Z";

function detection(overrides: Partial<Detection> = {}): Detection {
  const key = {
    sourceId: overrides.sourceId ?? SOURCE_IDS["NOAA-20"],
    acquiredAt: overrides.acquiredAt ?? ACQUIRED_AT,
    latitude: overrides.latitude ?? -1.725,
    longitude: overrides.longitude ?? 103.245,
  };
  return {
    id: detectionId(key),
    sourceId: key.sourceId,
    acquiredAt: key.acquiredAt,
    latitude: key.latitude,
    longitude: key.longitude,
    satellite: overrides.satellite ?? "NOAA-20",
    confidence: overrides.confidence ?? "rendah",
    daynight: overrides.daynight ?? "N",
    province: overrides.province ?? "jambi",
    version: overrides.version ?? "2.0NRT",
    frp: overrides.frp ?? 1.5,
    scan: overrides.scan ?? 0.4,
    track: overrides.track ?? 0.4,
  };
}

function source(overrides: Partial<SourceSnapshot> = {}): SourceSnapshot {
  return {
    sourceId: SOURCE_IDS["NOAA-20"],
    url: "synthetic://firms-viirs-noaa20-c2-nrt",
    retrievedAt: "2026-10-16T00:25:00Z",
    lastModified: "2026-10-16T00:20:00Z",
    etag: null,
    sha256: "a".repeat(64),
    bytes: 1024,
    rows: 1,
    status: "ok",
    ...overrides,
  };
}

function baseExport(): HashableExport {
  return {
    schemaVersion: 1,
    synthetic: true,
    createdAt: "2026-10-16T00:30:00Z",
    windowEnd: WINDOW_END,
    windowHours: 72,
    checkedAt: "2026-10-16T00:30:00Z",
    sourceUpdatedAt: "2026-10-16T00:20:00Z",
    latestObservationAt: ACQUIRED_AT,
    sources: [
      source(),
      source({
        sourceId: SOURCE_IDS["NOAA-21"],
        url: "synthetic://firms-viirs-noaa21-c2-nrt",
      }),
    ],
    boundary: {
      name: "synthetic-provinces",
      version: "provisional",
      licence: "synthetic",
      sha256: "b".repeat(64),
    },
    approval: { policy: "rules-v1", holds: [] },
    counts: {
      accepted: 1,
      duplicate: 0,
      outsideIndonesia: 0,
      outsideWindow: 0,
      invalid: {
        badNumber: 0,
        badTime: 0,
        badConfidence: 0,
        badDaynight: 0,
        badSatellite: 0,
        badVersion: 0,
        outOfRegion: 0,
      },
      byProvince: { jambi: 1 },
    },
    detections: [detection()],
  };
}

describe("canonical JSON", () => {
  test("sorts object keys, so insertion order does not matter", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  test("normalizes equivalent decimal spellings and negative zero", () => {
    expect(canonicalJson(JSON.parse("1.00"))).toBe(canonicalJson(JSON.parse("1")));
    expect(canonicalJson([-0])).toBe(canonicalJson([0]));
    expect(canonicalJson({ value: -0 })).toBe('{"value":0}');
  });

  test("rejects numbers JSON cannot represent", () => {
    expect(() => canonicalJson([Number.NaN])).toThrow(TypeError);
    expect(() => canonicalJson([Number.POSITIVE_INFINITY])).toThrow(TypeError);
  });

  test("rejects values JSON could silently drop", () => {
    expect(() => canonicalJson([undefined])).toThrow(TypeError);
    expect(() => canonicalJson({ value: () => 1 })).toThrow(TypeError);
  });
});

describe("UTC timestamps", () => {
  test("accept the contract shapes", () => {
    expect(isUtcSecond("2026-10-16T00:30:00Z")).toBe(true);
    expect(isUtcMinute("2026-10-15T18:36:00Z")).toBe(true);
  });

  test("reject offsets, milliseconds, and lowercase designators", () => {
    expect(isUtcSecond("2026-10-16T00:30:00+00:00")).toBe(false);
    expect(isUtcSecond("2026-10-16T00:30:00.000Z")).toBe(false);
    expect(isUtcSecond("2026-10-16T00:30:00z")).toBe(false);
    expect(isUtcMinute("2026-10-15T18:36:30Z")).toBe(false);
  });

  test("reject calendar overflow that Date.parse would roll over", () => {
    expect(isUtcSecond("2026-02-31T00:00:00Z")).toBe(false);
  });
});

describe("detection identity", () => {
  const key = {
    sourceId: SOURCE_IDS["NOAA-20"],
    acquiredAt: ACQUIRED_AT,
    latitude: -1.725,
    longitude: 103.245,
  };

  test("is a full SHA-256 of the canonical tuple", () => {
    expect(detectionId(key)).toMatch(/^[0-9a-f]{64}$/);
  });

  test("treats equivalent coordinate spellings as one key", () => {
    expect(
      detectionId({
        ...key,
        latitude: JSON.parse("1.00"),
        longitude: JSON.parse("101.50"),
      }),
    ).toBe(
      detectionId({
        ...key,
        latitude: JSON.parse("1"),
        longitude: JSON.parse("101.5"),
      }),
    );
    expect(detectionId({ ...key, latitude: -0, longitude: 0 })).toBe(
      detectionId({ ...key, latitude: 0, longitude: 0 }),
    );
  });

  test("changes with the source, minute, or coordinate", () => {
    expect(detectionId({ ...key, acquiredAt: "2026-10-15T18:37:00Z" })).not.toBe(detectionId(key));
    expect(detectionId({ ...key, latitude: -1.726 })).not.toBe(detectionId(key));
    expect(detectionId({ ...key, sourceId: SOURCE_IDS["NOAA-21"] })).not.toBe(detectionId(key));
  });
});

describe("export hashing", () => {
  test("identical exports produce identical hashes", () => {
    const first = baseExport();
    const second = structuredClone(first);
    expect(contentHash(first)).toBe(contentHash(second));
    expect(contentHash(first)).toMatch(/^[0-9a-f]{64}$/);
  });

  test("a changed row produces a different hash", () => {
    const before = baseExport();
    const after = structuredClone(before);
    after.detections[0].confidence = "tinggi";
    expect(contentHash(after)).not.toBe(contentHash(before));
  });

  test("a changed timestamp produces a different hash", () => {
    const before = baseExport();
    const after = structuredClone(before);
    after.checkedAt = "2026-10-16T00:31:00Z";
    expect(contentHash(after)).not.toBe(contentHash(before));
  });

  test("export identity embeds the content hash", () => {
    const hash = contentHash(baseExport());
    expect(exportId(hash)).toBe(`sat-${hash}`);
  });

  test("input order does not change the hash", () => {
    const forward = baseExport();
    forward.detections.push(
      detection({
        acquiredAt: "2026-10-15T10:00:00Z",
        latitude: 0.5,
        longitude: 101.5,
        province: "riau",
      }),
    );
    const reversed = structuredClone(forward);
    reversed.detections.reverse();
    reversed.sources.reverse();
    expect(contentHash(reversed)).toBe(contentHash(forward));
  });
});
