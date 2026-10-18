// Slice 3 tests: the synthetic generator, the checked-in fixture, and the
// 100,000-row capacity budget. See docs/plans/wp2-slice-3-generator.md.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vite-plus/test";

import { DETECTIONS } from "../app/design/detections.ts";
import { validateExport } from "../app/export/validate.ts";
import {
  PROVINCE_SLUGS,
  PROVISIONAL_PROVINCES,
  REPRODUCTION_WINDOW_END,
  reproductionExport,
  seededExport,
  serializeExport,
} from "./support/export-generator.ts";

const FIXTURE_PATH = fileURLToPath(new URL("./fixtures/export-v1-synthetic.json", import.meta.url));

beforeAll(() => {
  if (process.env.WRITE_EXPORT_FIXTURE === "1") {
    mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
    writeFileSync(FIXTURE_PATH, serializeExport(reproductionExport()));
  }
});

describe("reproduction export", () => {
  test("contains every design detection", () => {
    const document = reproductionExport();
    expect(document.detections).toHaveLength(60);
    expect(document.detections).toHaveLength(DETECTIONS.length);
    expect(document.counts.accepted).toBe(DETECTIONS.length);
    expect(document.synthetic).toBe(true);
    expect(document.windowEnd).toBe(REPRODUCTION_WINDOW_END);
  });

  test("matches each design row one to one", () => {
    const document = reproductionExport();
    const mapped = new Map(
      document.detections.map((detection) => [
        `${detection.acquiredAt}|${detection.latitude}|${detection.longitude}|` +
          `${detection.satellite}|${detection.confidence}`,
        detection,
      ]),
    );

    for (const row of DETECTIONS) {
      const key =
        `${row.acquiredAt}|${row.latitude}|${row.longitude}|` +
        `${row.satellite}|${row.confidence}`;
      const detection = mapped.get(key);
      expect(detection, key).toBeDefined();
      expect(detection?.province).toBe(PROVINCE_SLUGS[row.province as keyof typeof PROVINCE_SLUGS]);
    }
  });

  test("is deterministic", () => {
    expect(serializeExport(reproductionExport())).toBe(serializeExport(reproductionExport()));
  });

  test("keeps the design source rows and provinces", () => {
    const document = reproductionExport();
    expect(document.sources.map((source) => source.rows)).toEqual([37, 23]);
    expect(document.counts.byProvince).toEqual({
      jambi: 7,
      "kalimantan-barat": 7,
      "kalimantan-tengah": 21,
      papua: 3,
      riau: 9,
      "sumatra-selatan": 13,
    });
    expect(document.latestObservationAt).toBe("2026-10-15T18:36:00Z");
  });

  test("passes the validator and rejects production mode", () => {
    const document = reproductionExport();
    expect(() => validateExport(document)).not.toThrow();
    expect(() => validateExport(document, { allowSynthetic: false })).toThrow();
  });
});

describe("checked-in fixture", () => {
  test("equals a fresh reproduction", () => {
    const fixture = readFileSync(FIXTURE_PATH, "utf8");
    expect(fixture).toBe(serializeExport(reproductionExport()));
    expect(JSON.parse(fixture).contentHash).toBe(reproductionExport().contentHash);
  });

  test("is a valid synthetic export", () => {
    const document = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
    expect(document.synthetic).toBe(true);
    expect(() => validateExport(document)).not.toThrow();
    expect(() => validateExport(document, { allowSynthetic: false })).toThrow();
  });
});

describe("seeded export", () => {
  test("is deterministic for a fixed seed", () => {
    expect(seededExport({ seed: 7, rows: 100 }).contentHash).toBe(
      seededExport({ seed: 7, rows: 100 }).contentHash,
    );
  });

  test("changes when the seed changes", () => {
    expect(seededExport({ seed: 7, rows: 100 }).contentHash).not.toBe(
      seededExport({ seed: 8, rows: 100 }).contentHash,
    );
  });

  test("validates at small and empty sizes", () => {
    for (const rows of [0, 1, 60, 1000]) {
      expect(() => validateExport(seededExport({ rows }))).not.toThrow();
    }
  });

  test("honours a province selection", () => {
    const document = seededExport({ rows: 25, provinces: ["papua"] });
    for (const detection of document.detections) {
      expect(detection.province).toBe("papua");
    }
    expect(document.counts.byProvince).toEqual({ papua: 25 });
  });

  test("keeps counts, rows, and the window consistent", () => {
    const document = seededExport({ seed: 11, rows: 250 });
    const provinceTotal = Object.values(document.counts.byProvince).reduce(
      (total, count) => total + count,
      0,
    );
    const sourceRows = document.sources.reduce((total, source) => total + source.rows, 0);
    expect(provinceTotal).toBe(document.counts.accepted);
    expect(sourceRows).toBe(document.counts.accepted);

    const end = Date.parse(document.windowEnd);
    const start = end - 72 * 60 * 60 * 1000;
    for (const detection of document.detections) {
      const at = Date.parse(detection.acquiredAt);
      expect(at).toBeGreaterThan(start);
      expect(at).toBeLessThanOrEqual(end);
    }

    const latest = document.detections.reduce<string | null>(
      (current, detection) =>
        current === null || detection.acquiredAt > current ? detection.acquiredAt : current,
      null,
    );
    expect(document.latestObservationAt).toBe(latest);
  });

  test("covers the provisional province list", () => {
    const document = seededExport({ seed: 3, rows: 500 });
    const seen = new Set(document.detections.map((detection) => detection.province));
    for (const province of PROVISIONAL_PROVINCES) {
      expect(seen.has(province)).toBe(true);
    }
  });

  test("generates 100,000 rows in under 10 seconds", () => {
    const started = performance.now();
    const document = seededExport({ seed: 42, rows: 100_000 });
    const elapsed = performance.now() - started;
    expect(document.detections).toHaveLength(100_000);
    expect(elapsed).toBeLessThan(10_000);
  }, 20_000);
});
