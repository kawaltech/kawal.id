import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vite-plus/test";
import { type Outlines, inIndonesia, readOutlines, rings } from "../scripts/seed/boundary.ts";
import {
  FIRMS_HEADER,
  FIRMS_SEED_FILE,
  FIRMS_SOURCES,
  type FirmsSeed,
  type SourceSnapshot,
  buildFirmsSeed,
  runFirmsSeed,
} from "../scripts/seed/firms.ts";

// Synthetic outlines: "Indonesia" is 100..102°E and a neighbour is 102.2..104°E.
const OUTLINES: Outlines = {
  indonesia: rings([[100, -2, 102, -2, 102, 0, 100, 0]]),
  neighbours: rings([[102.2, -2, 104, -2, 104, 0, 102.2, 0]]),
  source: { name: "Synthetic squares", file: "test", sha256: "0".repeat(64) },
};
const RETRIEVED = "2026-10-18T12:00:30.500Z";
const [NOAA20, NOAA21] = FIRMS_SOURCES;

function row(fields: Partial<Record<string, string>> = {}): string {
  const base: Record<string, string> = {
    latitude: "-1.0",
    longitude: "101.0",
    bright_ti4: "330.1",
    scan: "0.4",
    track: "0.6",
    acq_date: "2026-10-18",
    acq_time: "530",
    satellite: "N20",
    confidence: "nominal",
    version: "2.0NRT",
    bright_ti5: "295.2",
    frp: "4.5",
    daynight: "D",
  };
  return FIRMS_HEADER.split(",")
    .map((name) => fields[name] ?? base[name])
    .join(",");
}

function snapshot(rows: string[], source = NOAA20, header = FIRMS_HEADER): SourceSnapshot {
  return {
    source,
    body: Buffer.from(`${[header, ...rows].join("\n")}\n`),
    retrievedAt: RETRIEVED,
    etag: '"fixture"',
    lastModified: "Sun, 18 Oct 2026 11:40:00 GMT",
  };
}

const build = (snapshots: SourceSnapshot[]) =>
  buildFirmsSeed(snapshots, OUTLINES, { windowHours: 168, bufferKm: 10, createdAt: RETRIEVED });

test("normalize a FIRMS row to the seed detection fields", () => {
  const seed = build([snapshot([row()])]);
  expect(seed.counts).toEqual({
    rows: 1,
    invalid: {},
    outsideWindow: 0,
    outsideIndonesia: 0,
    duplicate: 0,
    accepted: 1,
  });
  const id = createHash("sha256")
    .update(JSON.stringify([NOAA20.sourceId, "2026-10-18T05:30:00Z", -1, 101]))
    .digest("hex");
  expect(seed.detections).toEqual([
    {
      id,
      sourceId: NOAA20.sourceId,
      acquiredAt: "2026-10-18T05:30:00Z",
      latitude: -1,
      longitude: 101,
      satellite: "NOAA-20",
      confidence: "nominal",
      daynight: "D",
      version: "2.0NRT",
      frp: 4.5,
      scan: 0.4,
      track: 0.6,
      brightTi4: 330.1,
      brightTi5: 295.2,
    },
  ]);
  expect(seed.windowEnd).toBe("2026-10-18T12:00:30.000Z");
  expect(seed.synthetic).toBe(false);
  expect(seed.notice).toContain("not a confirmed fire");
});

test("classify each row once: invalid, outside the window, outside Indonesia, duplicate", () => {
  const seed = build([
    snapshot([
      row(),
      row(),
      row({ latitude: "-1", longitude: "101.00" }),
      row({ confidence: "x" }),
      row({ satellite: "N21" }),
      row({ version: "2.0SP" }),
      row({ acq_time: "2460" }),
      row({ acq_date: "2026-10-19" }),
      row({ frp: "" }),
      row({ acq_date: "2026-10-11", acq_time: "1200" }),
      row({ longitude: "103" }),
      row({ longitude: "102.05" }),
      row({ longitude: "102.15" }),
      row({ longitude: "99" }),
      "-1.0,101.0",
    ]),
    snapshot(
      [row({ satellite: "N21", confidence: "h" }), row({ satellite: "2", acq_time: "0531" })],
      NOAA21,
    ),
  ]);
  expect(seed.counts).toEqual({
    rows: 17,
    invalid: {
      columns: 1,
      confidence: 1,
      future: 1,
      number: 1,
      satellite: 1,
      time: 1,
      version: 1,
    },
    outsideWindow: 1,
    outsideIndonesia: 3,
    duplicate: 2,
    accepted: 4,
  });
  const [latest, ...others] = seed.detections.map(
    ({ acquiredAt, longitude, satellite, confidence }) =>
      `${acquiredAt} ${longitude} ${satellite} ${confidence}`,
  );
  expect(latest).toBe("2026-10-18T05:31:00Z 101 NOAA-21 nominal");
  expect(others.sort()).toEqual([
    "2026-10-18T05:30:00Z 101 NOAA-20 nominal",
    "2026-10-18T05:30:00Z 101 NOAA-21 tinggi",
    "2026-10-18T05:30:00Z 102.05 NOAA-20 nominal",
  ]);
  expect(seed.latestObservationAt).toBe("2026-10-18T05:31:00Z");
  expect(seed.earliestObservationAt).toBe("2026-10-18T05:30:00Z");
});

test("hold the seed when a repeated key has different values", () => {
  expect(() => build([snapshot([row(), row({ frp: "9.9" })])])).toThrow(/different values/);
});

test("reject a file with an unexpected header", () => {
  expect(() => build([snapshot([row()], NOAA20, FIRMS_HEADER.replace("frp", "power"))])).toThrow(
    /unexpected CSV header/,
  );
});

test("the shared outline separates Indonesia from its neighbours", () => {
  const outlines = readOutlines();
  const places: [string, number, number, boolean][] = [
    ["Palangka Raya", 113.92, -2.21, true],
    ["Pekanbaru", 101.45, 0.51, true],
    ["Jayapura", 140.72, -2.53, true],
    ["Jakarta", 106.85, -6.2, true],
    ["Kuching", 110.35, 1.55, false],
    ["Kuala Lumpur", 101.69, 3.14, false],
    ["Singapore", 103.82, 1.35, false],
    ["Dili", 125.57, -8.56, false],
    ["Port Moresby", 147.18, -9.44, false],
    ["Darwin", 130.84, -12.46, false],
    ["Indian Ocean", 100, -8, false],
  ];
  for (const [name, longitude, latitude, expected] of places) {
    expect([name, inIndonesia(outlines, longitude, latitude, 10)]).toEqual([name, expected]);
  }
});

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("write the seed and keep the previous files when a later run fails", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "kawal-seed-firms-"));
  roots.push(outDir);
  const bodies = new Map([
    [NOAA20.url, snapshot([row()]).body],
    [NOAA21.url, snapshot([row({ satellite: "N21" })], NOAA21).body],
  ]);
  const fetch = async (url: string) => {
    const body = bodies.get(url);
    return body
      ? new Response(new Uint8Array(body), { headers: { "content-length": String(body.length) } })
      : new Response("missing", { status: 404 });
  };
  const now = () => new Date(RETRIEVED);
  const seed = await runFirmsSeed({ outDir, fetch, now, outlines: OUTLINES });
  const path = join(outDir, FIRMS_SEED_FILE);
  const written = readFileSync(path, "utf8");
  expect((JSON.parse(written) as FirmsSeed).detections).toEqual(seed.detections);
  expect(written.split("\n").filter((line) => line.startsWith('    {"id":'))).toHaveLength(2);
  expect(existsSync(join(outDir, "firms/raw/J1_VIIRS_C2_SouthEast_Asia_7d.csv"))).toBe(true);

  bodies.set(NOAA21.url, Buffer.from("not,a,firms,file\n"));
  await expect(runFirmsSeed({ outDir, fetch, now, outlines: OUTLINES })).rejects.toThrow(/header/);
  expect(readFileSync(path, "utf8")).toBe(written);

  bodies.delete(NOAA20.url);
  await expect(runFirmsSeed({ outDir, fetch, now, outlines: OUTLINES })).rejects.toThrow(
    /HTTP 404/,
  );
  expect(readFileSync(path, "utf8")).toBe(written);
});
