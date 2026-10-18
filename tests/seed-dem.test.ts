import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vite-plus/test";
import { type Outlines, indonesiaMask, rasterize, rings } from "../scripts/seed/boundary.ts";
import {
  type DemSeed,
  type DemSource,
  NODATA,
  blockMeans,
  parseTileList,
  runDemSeed,
  tileName,
  tileUrl,
} from "../scripts/seed/dem.ts";
import { readGeoTiff, undoFloatPredictor } from "../scripts/seed/geotiff.ts";
import { encodeGeoTiff } from "./support/geotiff.ts";

const OUTLINES: Outlines = {
  indonesia: rings([[100, -2, 102, -2, 102, 0, 100, 0]]),
  neighbours: rings([[102.2, -2, 104, -2, 104, 0, 102.2, 0]]),
  source: { name: "Synthetic squares", file: "test", sha256: "0".repeat(64) },
};

test.each([
  { compression: 8, predictor: 3 },
  { compression: 1, predictor: 1 },
] as const)("read a tiled Float32 GeoTIFF: %o", ({ compression, predictor }) => {
  const values = Float32Array.from({ length: 5 * 3 }, (_, i) => (i % 2 ? -i * 1.25 : i * 100.5));
  const raster = readGeoTiff(
    encodeGeoTiff({
      width: 5,
      height: 3,
      tileWidth: 4,
      tileHeight: 2,
      values,
      west: 113,
      north: -2,
      scale: 0.25,
      compression,
      predictor,
    }),
  );
  expect([...raster.values]).toEqual([...values]);
  expect(raster).toMatchObject({
    width: 5,
    height: 3,
    west: 113,
    north: -2,
    scaleX: 0.25,
    scaleY: 0.25,
    pixelIsPoint: true,
    epsg: 4326,
    nodata: null,
  });
});

test("undo the floating-point predictor", () => {
  // Two little-endian samples, 1.0 (00 00 80 3f) and -2.0 (00 00 00 c0), as
  // byte planes from most to least significant, then byte differences.
  const planes = [0x3f, 0xc0, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00];
  const row = Uint8Array.from(planes, (value, i) => (i ? (value - planes[i - 1]) & 0xff : value));
  expect([...new Float32Array(undoFloatPredictor(row, 2).buffer)]).toEqual([1, -2]);
});

test("reject a TIFF layout that the reader does not support", () => {
  const file = encodeGeoTiff({
    width: 2,
    height: 2,
    tileWidth: 2,
    tileHeight: 2,
    values: new Float32Array(4),
    west: 0,
    north: 0,
    scale: 1,
  });
  file[0] = 0x4d;
  file[1] = 0x4d;
  expect(() => readGeoTiff(file)).toThrow(/little-endian/);
});

test("average source blocks without invalid samples", () => {
  const values = Float32Array.from([1, 3, 10, 10, 5, NaN, 10, -9999, 0, 0, 2, 2, 0, 4, 2, 2]);
  expect([...blockMeans(values, 4, 2, -9999)]).toEqual([3, 10, 1, 2]);
});

test("name Copernicus tiles by their south-west corner", () => {
  const source = { prefix: "Copernicus_DSM_COG_30", base: "https://example.test" } as DemSource;
  expect(tileName(source, -3, 113)).toBe("Copernicus_DSM_COG_30_S03_00_E113_00_DEM");
  expect(tileName(source, 0, 95)).toBe("Copernicus_DSM_COG_30_N00_00_E095_00_DEM");
  expect(tileUrl(source, "X")).toBe("https://example.test/X/X.tif");
  expect(() => parseTileList(source, "Copernicus_DSM_COG_30_S03_00_E113_00_DEM\n<html>")).toThrow(
    /Unexpected tile list entry/,
  );
});

test("rasterize cell centres with the point-in-polygon rule", () => {
  const grid = { west: 99, north: 1, cell: 0.5, width: 8, height: 6 };
  const mask = rasterize(OUTLINES.indonesia, grid);
  const rows = Array.from({ length: grid.height }, (_, row) =>
    [...mask.subarray(row * grid.width, (row + 1) * grid.width)].join(""),
  );
  expect(rows).toEqual(["00000000", "00000000", "00111100", "00111100", "00111100", "00111100"]);
  const buffered = indonesiaMask(
    OUTLINES,
    { west: 101.5, north: 0, cell: 0.05, width: 20, height: 1 },
    10,
  );
  // Centres at 102.025 and 102.075 are inside the buffer and nearer to Indonesia.
  expect([...buffered].join("")).toBe("11111111111100000000");
});

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("make a masked national grid and reuse cached tiles", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "kawal-seed-dem-"));
  roots.push(outDir);
  // 12 samples per degree and 900″ cells: each output cell averages 3 x 3 samples.
  const source: DemSource = {
    id: "synthetic-dem",
    product: "Synthetic",
    base: "https://dem.example.test",
    prefix: "Copernicus_DSM_COG_30",
    samplesPerDegree: 12,
  };
  const land = [
    [-1, 100],
    [-1, 101],
    [-2, 100],
  ];
  const files = new Map<string, Uint8Array>();
  for (const [south, west] of land) {
    const name = tileName(source, south, west);
    const values = Float32Array.from({ length: 144 }, (_, i) => west + south * 10 + (i % 3) - 1);
    files.set(
      tileUrl(source, name),
      encodeGeoTiff({
        width: 12,
        height: 12,
        tileWidth: 8,
        tileHeight: 8,
        values,
        west,
        north: south + 1,
        scale: 1 / 12,
      }),
    );
  }
  const names = land.map(([south, west]) => tileName(source, south, west));
  files.set(`${source.base}/tileList.txt`, Buffer.from(`${names.join("\n")}\n`));
  const requested: string[] = [];
  const fetch = async (url: string) => {
    requested.push(url);
    const body = files.get(url);
    return body ? new Response(new Uint8Array(body)) : new Response("missing", { status: 404 });
  };
  const options = { outDir, fetch, source, outlines: OUTLINES, cellArcSec: 900, bufferKm: 10 };
  const seed = await runDemSeed(options);
  expect(seed.grid).toMatchObject({
    west: 99,
    east: 103,
    south: -3,
    north: 1,
    width: 16,
    height: 16,
  });
  expect(seed.counts).toMatchObject({
    tiles: 4,
    tilesDownloaded: 3,
    tilesReused: 0,
    oceanTiles: 1,
  });
  expect(seed.counts).toMatchObject({ minimum: 0, maximum: 91 });
  expect(seed.tiles.map(({ name }) => name)).toEqual([...names].sort());

  const bytes = readFileSync(join(outDir, "dem/indonesia-glo90-900s.i16"));
  const heights = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
  const at = (longitude: number, latitude: number) =>
    heights[Math.floor((1 - latitude) / 0.25) * 16 + Math.floor((longitude - 99) / 0.25)];
  expect(at(100.1, -0.1)).toBe(90);
  expect(at(101.9, -0.9)).toBe(91);
  expect(at(100.5, -1.5)).toBe(80);
  // 101..102°E, 2..1°S has no tile: it is an ocean area with height 0.
  expect(at(101.5, -1.5)).toBe(0);
  expect(at(99.5, -0.5)).toBe(NODATA);
  expect(at(102.6, -0.5)).toBe(NODATA);
  const metadata = JSON.parse(
    readFileSync(join(outDir, "dem/indonesia-glo90-900s.json"), "utf8"),
  ) as DemSeed;
  expect(metadata.licenceNotice).toContain("Copernicus");
  expect(readFileSync(join(outDir, "dem/indonesia-glo90-900s.png")).subarray(1, 4).toString()).toBe(
    "PNG",
  );

  requested.length = 0;
  const again = await runDemSeed(options);
  expect(requested).toEqual([`${source.base}/tileList.txt`]);
  expect(again.counts).toMatchObject({ tilesDownloaded: 0, tilesReused: 3 });
  expect(readFileSync(join(outDir, "dem/indonesia-glo90-900s.i16"))).toEqual(bytes);
});

test("reject a cell size that does not divide the source grid", async () => {
  await expect(
    runDemSeed({
      outDir: tmpdir(),
      outlines: OUTLINES,
      cellArcSec: 40,
      fetch: async () => new Response(""),
    }),
  ).rejects.toThrow(/whole multiple/);
});
