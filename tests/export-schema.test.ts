// Contract tests for WP2 slices 1 and 2: canonical serialization, hashing, and
// export validation. See docs/plans/wp2-export-contract.md.
import { describe, expect, test } from "vite-plus/test";

import { canonicalJson, isUtcMinute, isUtcSecond } from "../app/export/canonical.ts";
import { contentHash, detectionId, exportId } from "../app/export/hash.ts";
import { ExportValidationError, checkExport, validateExport } from "../app/export/validate.ts";
import {
  SOURCE_IDS,
  type Detection,
  type ExportV1,
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
    retrievedAt: WINDOW_END,
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
        rows: 0,
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

function signed(document: HashableExport): ExportV1 {
  const hash = contentHash(document);
  return { ...document, exportId: exportId(hash), contentHash: hash };
}

function signedBase(): ExportV1 {
  return signed(baseExport());
}

/** Recompute accepted counts, province counts, and rows for a test document. */
function withDetections(detections: Detection[]): HashableExport {
  const document = baseExport();
  const byProvince: Record<string, number> = {};
  for (const item of detections) {
    byProvince[item.province] = (byProvince[item.province] ?? 0) + 1;
  }
  return {
    ...document,
    detections,
    latestObservationAt: detections.reduce<string | null>(
      (current, item) =>
        current === null || item.acquiredAt > current ? item.acquiredAt : current,
      null,
    ),
    counts: { ...document.counts, accepted: detections.length, byProvince },
    sources: document.sources.map((entry) => ({
      ...entry,
      rows: entry.sourceId === SOURCE_IDS["NOAA-20"] ? detections.length : 0,
    })),
  };
}

function issuePaths(input: unknown): string[] {
  const result = checkExport(input);
  return result.ok ? [] : result.issues.map((issue) => issue.path);
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

describe("export validation", () => {
  test("accepts a valid export", () => {
    expect(checkExport(signedBase()).ok).toBe(true);
  });

  test("returns the document from validateExport", () => {
    const document = signedBase();
    expect(validateExport(document)).toBe(document);
  });

  test("throws ExportValidationError with issues", () => {
    expect(() => validateExport({})).toThrow(ExportValidationError);
  });

  test("rejects an unknown top-level key", () => {
    expect(issuePaths({ ...signedBase(), extra: true })).toContain("$.extra");
  });

  test("rejects report keys at the top level and nested", () => {
    expect(issuePaths({ ...signedBase(), reports: [] })).toContain("$.reports");

    const nested = signedBase() as unknown as Record<string, unknown>;
    (nested.boundary as Record<string, unknown>).reports = [];
    expect(issuePaths(nested)).toContain("$.boundary.reports");
  });

  test("rejects missing provenance", () => {
    const document = signedBase() as unknown as Record<string, unknown>;
    delete document.sources;
    expect(issuePaths(document)).toContain("$.sources");
  });

  test("rejects counts that do not match the detections", () => {
    const document = structuredClone(signedBase());
    document.counts.accepted = 2;
    expect(issuePaths(document)).toContain("$.counts.accepted");
  });

  test("rejects a row outside the window", () => {
    const document = signed(withDetections([detection({ acquiredAt: "2026-10-13T00:30:00Z" })]));
    expect(issuePaths(document)).toContain("$.detections[0].acquiredAt");
  });

  test("rejects a duplicate detection id", () => {
    const document = signed(withDetections([detection(), detection()]));
    expect(issuePaths(document)).toContain("$.detections[1].id");
  });

  test("rejects non-UTC timestamps", () => {
    const document = structuredClone(signedBase());
    document.createdAt = "2026-10-16T00:30:00+00:00";
    expect(issuePaths(document)).toContain("$.createdAt");

    const minute = signed(withDetections([detection({ acquiredAt: "2026-10-15T18:36:30Z" })]));
    expect(issuePaths(minute)).toContain("$.detections[0].acquiredAt");
  });

  test("rejects an unknown confidence", () => {
    const document = signed(
      withDetections([detection({ confidence: "medium" as unknown as Detection["confidence"] })]),
    );
    expect(issuePaths(document)).toContain("$.detections[0].confidence");
  });

  test("accepts zero detections when every source is ok", () => {
    expect(checkExport(signed(withDetections([]))).ok).toBe(true);
  });

  test("rejects zero detections when a source failed", () => {
    const empty = withDetections([]);
    const failed: HashableExport = {
      ...empty,
      sources: empty.sources.map((entry, index) =>
        index === 1 ? { ...entry, status: "failed" as const, reason: "timeout" } : entry,
      ),
    };
    expect(issuePaths(signed(failed))).toContain("$.detections");
  });

  test("includes the window end and excludes the window start", () => {
    expect(checkExport(signed(withDetections([detection({ acquiredAt: WINDOW_END })]))).ok).toBe(
      true,
    );
    expect(
      checkExport(signed(withDetections([detection({ acquiredAt: "2026-10-13T00:30:00Z" })]))).ok,
    ).toBe(false);
    expect(
      checkExport(signed(withDetections([detection({ acquiredAt: "2026-10-13T00:31:00Z" })]))).ok,
    ).toBe(true);
  });

  test("rejects a satellite that disagrees with its source", () => {
    const document = signed(withDetections([detection({ satellite: "NOAA-21" })]));
    expect(issuePaths(document)).toContain("$.detections[0].sourceId");
  });

  test("rejects a tampered content hash or identity", () => {
    const document = structuredClone(signedBase());
    document.contentHash = "c".repeat(64);
    const paths = issuePaths(document);
    expect(paths).toContain("$.contentHash");
    expect(paths).toContain("$.exportId");
  });

  test("rejects a synthetic export in production mode", () => {
    const result = checkExport(signedBase(), { allowSynthetic: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.path)).toContain("$.synthetic");
  });

  test("rejects a province count that does not match the rows", () => {
    const document = structuredClone(signedBase());
    document.counts.byProvince = { riau: 1 };
    expect(issuePaths(document).some((path) => path.startsWith("$.counts.byProvince"))).toBe(true);
  });

  test("rejects source rows that do not match the counts", () => {
    const document = structuredClone(signedBase());
    document.sources[0].rows = 2;
    expect(issuePaths(document)).toContain("$.counts");
  });

  test("rejects an unknown invalid reason", () => {
    const document = structuredClone(signedBase()) as unknown as Record<string, unknown>;
    const counts = document.counts as Record<string, unknown>;
    const invalid = counts.invalid as Record<string, unknown>;
    invalid.other = 1;
    expect(issuePaths(document)).toContain("$.counts.invalid.other");
  });

  test("rejects duplicate sources and unknown nested fields", () => {
    const document = withDetections([detection()]);
    const duplicated: HashableExport = {
      ...document,
      sources: [document.sources[0], document.sources[0]],
    };
    expect(issuePaths(signed(duplicated))).toContain("$.sources[1].sourceId");

    const nested = signedBase() as unknown as Record<string, unknown>;
    const detections = nested.detections as Record<string, unknown>[];
    detections[0].extra = true;
    expect(issuePaths(nested)).toContain("$.detections[0].extra");
  });
});
