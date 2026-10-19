import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vite-plus/test";
import {
  GROUPS,
  dailyCounts,
  decodeDetections,
  encodeDetections,
  groupCounts,
  heightAt,
  selectDetections,
  type DemPreviewMeta,
  type DetectionInput,
} from "../app/design/indonesia-data.ts";
import { type Outlines, rings } from "../scripts/seed/boundary.ts";
import {
  buildPreview,
  downsample,
  groupOf,
  previewCache,
  previewResponse,
  ringGroups,
} from "../scripts/seed/preview.ts";

const EPOCH = Date.parse("2026-10-11T12:00:00Z") / 60_000;

function detection(patch: Partial<DetectionInput>): DetectionInput {
  return {
    longitude: 113.5,
    latitude: -1.5,
    frp: 3.25,
    acquiredAt: "2026-10-18T05:30:00Z",
    confidence: "nominal",
    satellite: "NOAA-20",
    daynight: "D",
    group: 1,
    ...patch,
  };
}

test("encode and decode the compact detection records", () => {
  const list = [
    detection({}),
    detection({
      longitude: 101.25,
      latitude: 0.5,
      frp: 12.5,
      acquiredAt: "2026-10-11T12:00:00Z",
      confidence: "tinggi",
      satellite: "NOAA-21",
      daynight: "N",
      group: 5,
    }),
  ];
  const bytes = encodeDetections(list, EPOCH);
  expect(bytes.length).toBe(32);
  const decoded = decodeDetections(bytes.buffer as ArrayBuffer, EPOCH);
  expect(decoded.count).toBe(2);
  expect([...decoded.longitude]).toEqual([113.5, 101.25]);
  expect([...decoded.latitude]).toEqual([-1.5, 0.5]);
  expect([...decoded.frp]).toEqual([3.25, 12.5]);
  expect([...decoded.time].map((time) => new Date(time).toISOString())).toEqual([
    "2026-10-18T05:30:00.000Z",
    "2026-10-11T12:00:00.000Z",
  ]);
  expect([...decoded.confidence]).toEqual([1, 2]);
  expect([...decoded.satellite]).toEqual([0, 1]);
  expect([...decoded.night]).toEqual([0, 1]);
  expect([...decoded.group]).toEqual([1, 5]);
  expect(() =>
    encodeDetections([detection({ acquiredAt: "2026-10-11T11:59:00Z" })], EPOCH),
  ).toThrow(/outside/);
  expect(() => encodeDetections([detection({ group: GROUPS.length })], EPOCH)).toThrow(/group/);
  expect(() => decodeDetections(new ArrayBuffer(17), EPOCH)).toThrow(/partial/);
});

test("filter by window, confidence, and satellite, then count by WIB day and island group", () => {
  const list = [
    detection({ acquiredAt: "2026-10-18T16:00:00Z", group: 4 }), // 18 Oct 23.00 WIB
    detection({ acquiredAt: "2026-10-18T17:30:00Z", confidence: "tinggi" }), // 19 Oct 00.30 WIB
    detection({ acquiredAt: "2026-10-17T18:30:00Z", satellite: "NOAA-21" }), // 18 Oct 01.30 WIB
    detection({ acquiredAt: "2026-10-12T12:00:00Z", confidence: "rendah", group: 0 }),
  ];
  const decoded = decodeDetections(encodeDetections(list, EPOCH).buffer as ArrayBuffer, EPOCH);
  const end = Date.parse("2026-10-18T18:00:00Z");
  const all = {
    hours: 168,
    confidences: ["rendah", "nominal", "tinggi"] as const,
    satellites: ["NOAA-20", "NOAA-21"] as const,
  };
  expect([...selectDetections(decoded, end, all)]).toEqual([0, 1, 2, 3]);
  expect([...selectDetections(decoded, end, { ...all, hours: 24 })]).toEqual([0, 1, 2]);
  expect([...selectDetections(decoded, end, { ...all, confidences: ["tinggi"] })]).toEqual([1]);
  expect([...selectDetections(decoded, end, { ...all, satellites: ["NOAA-21"] })]).toEqual([2]);
  expect([...selectDetections(decoded, end, { ...all, confidences: [] })]).toEqual([]);

  const selection = selectDetections(decoded, end, all);
  const daily = dailyCounts(decoded, selection, end, 168);
  expect(daily.map((row) => row.key)).toEqual([
    "2026-10-12",
    "2026-10-13",
    "2026-10-14",
    "2026-10-15",
    "2026-10-16",
    "2026-10-17",
    "2026-10-18",
    "2026-10-19",
  ]);
  expect(daily.map((row) => row.total)).toEqual([1, 0, 0, 0, 0, 0, 2, 1]);
  expect(daily.at(-1)?.counts).toEqual([0, 0, 1]);
  const groups = groupCounts(decoded, selection);
  expect(groups.map((row) => row.key)).toEqual([...GROUPS]);
  expect(groups.map((row) => row.total)).toEqual([1, 2, 0, 0, 1, 0]);
});

test("sample heights bilinearly and skip nodata cells", () => {
  const meta = {
    west: 100,
    north: 2,
    cell: 1,
    width: 2,
    height: 2,
    nodata: -32768,
  } as DemPreviewMeta;
  const heights = Int16Array.from([0, 100, 200, -32768]);
  expect(heightAt(meta, heights, 100.5, 1.5)).toBe(0);
  expect(heightAt(meta, heights, 101, 1.5)).toBe(50);
  expect(heightAt(meta, heights, 101, 1)).toBeCloseTo(100);
  expect(heightAt(meta, heights, 101.5, 0.5)).toBeNull();
  expect(heightAt(meta, heights, 99, 1)).toBeNull();
});

test("downsample a height grid with partial edge blocks and nodata", () => {
  const nodata = -32768;
  const grid = Int16Array.from([10, 20, 30, 40, 50, 60, nodata, nodata, 90]);
  expect(downsample(grid, 3, 3, 2, nodata)).toEqual({
    heights: Int16Array.from([30, 45, nodata, 90]),
    width: 2,
    height: 2,
  });
});

const OUTLINES: Outlines = {
  indonesia: rings([
    [109, -8, 111, -8, 111, -7, 109, -7],
    [113, -2, 114, -2, 114, -1, 113, -1],
    [130, -5, 130.5, -5, 130.5, -4.5, 130, -4.5],
  ]),
  neighbours: rings([[114.5, -2, 116, -2, 116, -1, 114.5, -1]]),
  source: { name: "Synthetic squares", file: "test", sha256: "0".repeat(64) },
};

test("assign island groups from the containing or nearest ring", () => {
  const groups = ringGroups(OUTLINES);
  expect([...groups]).toEqual([0, 1, 5]);
  expect(groupOf(OUTLINES.indonesia, groups, 110, -7.5, 10)).toBe(0);
  expect(groupOf(OUTLINES.indonesia, groups, 114.05, -1.5, 10)).toBe(1);
  expect(groupOf(OUTLINES.indonesia, groups, 130.2, -4.8, 10)).toBe(5);
  expect(groupOf(OUTLINES.indonesia, groups, 120, -3, 10)).toBe(5);
});

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function seedDirectory() {
  const root = mkdtempSync(join(tmpdir(), "kawal-seed-preview-"));
  roots.push(root);
  return root;
}

function writeSeeds(root: string) {
  mkdirSync(join(root, "firms"), { recursive: true });
  mkdirSync(join(root, "dem"), { recursive: true });
  const firms = {
    createdAt: "2026-10-18T12:01:00.000Z",
    windowEnd: "2026-10-18T12:00:30.000Z",
    windowHours: 168,
    earliestObservationAt: "2026-10-18T05:30:00Z",
    latestObservationAt: "2026-10-18T05:31:00Z",
    attribution: "Synthetic attribution",
    notice: "Synthetic notice",
    boundary: { name: "Synthetic squares", file: "test", sha256: "0".repeat(64), bufferKm: 10 },
    counts: {
      rows: 3,
      invalid: { time: 1 },
      outsideWindow: 0,
      outsideIndonesia: 0,
      duplicate: 0,
      accepted: 2,
    },
    sources: [
      {
        sourceId: "synthetic",
        url: "https://example.test/a.csv",
        retrievedAt: "2026-10-18T12:00:30.500Z",
        lastModified: null,
        etag: null,
        sha256: "a".repeat(64),
        bytes: 1,
        rows: 3,
      },
    ],
    detections: [
      {
        longitude: 113.5,
        latitude: -1.5,
        frp: 1,
        acquiredAt: "2026-10-18T05:31:00Z",
        confidence: "tinggi",
        satellite: "NOAA-21",
        daynight: "D",
      },
      {
        longitude: 110,
        latitude: -7.5,
        frp: 2,
        acquiredAt: "2026-10-18T05:30:00Z",
        confidence: "rendah",
        satellite: "NOAA-20",
        daynight: "N",
      },
    ],
  };
  writeFileSync(join(root, "firms/viirs-indonesia-7d.json"), JSON.stringify(firms));
  const dem = {
    createdAt: "2026-10-18T12:02:00.000Z",
    notice: "Synthetic DEM",
    licenceNotice: "Synthetic licence",
    source: {
      id: "synthetic-dem",
      product: "Synthetic",
      surface: "DSM",
      horizontal: "WGS 84",
      vertical: "EGM2008",
    },
    grid: {
      west: 100,
      north: 2,
      cell: 1 / 120,
      width: 4,
      height: 2,
      nodata: -32768,
      cellArcSec: 30,
    },
    counts: { minimum: 0, maximum: 70 },
    tiles: [{ name: "a" }],
  };
  writeFileSync(join(root, "dem/indonesia-glo90-30s.json"), JSON.stringify(dem));
  writeFileSync(
    join(root, "dem/indonesia-glo90-30s.i16"),
    new Uint8Array(Int16Array.from([0, 10, 20, -32768, 40, 50, 60, 70]).buffer),
  );
}

test("build preview payloads from local seed files and report missing seeds", () => {
  const empty = buildPreview(seedDirectory(), OUTLINES);
  expect(empty.meta).toEqual({
    schemaVersion: 1,
    firms: null,
    dem: null,
    landcover: null,
    features: null,
    detail: false,
  });
  expect(previewResponse(empty, "/meta.json")).toMatchObject({ status: 200 });
  expect(previewResponse(empty, "/dem.i16")).toMatchObject({ status: 404 });
  expect(previewResponse(empty, "/firms.bin")).toMatchObject({ status: 404 });
  expect(previewResponse(empty, "/../dem/indonesia-glo90-30s.i16")).toMatchObject({ status: 404 });

  const root = seedDirectory();
  writeSeeds(root);
  const preview = buildPreview(root, OUTLINES);
  expect(preview.meta.dem).toMatchObject({
    width: 4,
    height: 2,
    cellArcSec: 30,
    cell: 1 / 120,
    minimum: 0,
    maximum: 70,
  });
  expect([...new Int16Array((preview.dem as Uint8Array).slice().buffer)]).toEqual([
    0, 10, 20, -32768, 40, 50, 60, 70,
  ]);
  expect(preview.meta.detail).toBe(false);
  const firms = preview.meta.firms;
  expect(firms).toMatchObject({
    count: 2,
    windowHours: 168,
    rows: { total: 3, accepted: 2, invalid: 1 },
  });
  const decoded = decodeDetections(
    (preview.firms as Uint8Array).slice().buffer,
    firms?.epochMinute ?? 0,
  );
  expect([...decoded.group]).toEqual([1, 0]);
  expect([...decoded.confidence]).toEqual([2, 0]);
  expect(new Date(decoded.time[0]).toISOString()).toBe("2026-10-18T05:31:00.000Z");
  const meta = previewResponse(preview, "/meta.json");
  expect(meta.type).toContain("application/json");
  expect(JSON.parse(String(meta.body))).toEqual(preview.meta);
});

test("rebuild the cached payloads only after a seed file changes", () => {
  const root = seedDirectory();
  writeSeeds(root);
  let builds = 0;
  const payload = previewCache(root, (directory) => {
    builds++;
    return buildPreview(directory, OUTLINES);
  });
  payload();
  payload();
  expect(builds).toBe(1);
  const later = new Date(Date.now() + 60_000);
  utimesSync(join(root, "firms/viirs-indonesia-7d.json"), later, later);
  payload();
  expect(builds).toBe(2);
});
