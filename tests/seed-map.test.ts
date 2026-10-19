import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vite-plus/test";
import { DETAIL_SIZE, decodeDetail } from "../app/design/indonesia-data.ts";
import { type Outlines, rings } from "../scripts/seed/boundary.ts";
import { selectFeatures } from "../scripts/seed/features.ts";
import { decodeImage, readImages, tileRange } from "../scripts/seed/geotiff.ts";
import {
  type LandcoverSource,
  landcoverCacheFile,
  majorityClasses,
  parseWorldcoverGrid,
  readWorldcoverTile,
  runLandcoverSeed,
  worldcoverName,
  worldcoverUrl,
  WORLDCOVER,
} from "../scripts/seed/landcover.ts";
import {
  buildDetail,
  buildPreview,
  detailCache,
  previewResponse,
} from "../scripts/seed/preview.ts";
import { encodeGeoTiff } from "./support/geotiff.ts";

const OUTLINES: Outlines = {
  indonesia: rings([[100, -2, 102, -2, 102, 0, 100, 0]]),
  neighbours: rings([[102.2, -2, 104, -2, 104, 0, 102.2, 0]]),
  source: { name: "Synthetic squares", file: "test", sha256: "0".repeat(64) },
};

test("pick the majority land cover class, with nodata only for empty cells", () => {
  const values = Uint8Array.from([10, 10, 40, 0, 10, 40, 40, 0, 0, 0, 80, 80, 0, 0, 80, 50]);
  expect([...majorityClasses(values, 4, 2)]).toEqual([10, 40, 0, 80]);
});

test("name WorldCover tiles and read the grid index", () => {
  expect(worldcoverName(-3, 111)).toBe("S03E111");
  expect(worldcoverName(0, 95)).toBe("N00E095");
  expect(worldcoverUrl(WORLDCOVER, "S03E111")).toBe(
    "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_S03E111_Map.tif",
  );
  const grid = JSON.stringify({ features: [{ properties: { ll_tile: "S03E111" } }] });
  expect([...parseWorldcoverGrid(grid)]).toEqual(["S03E111"]);
  expect(() => parseWorldcoverGrid(JSON.stringify({ features: [{ properties: {} }] }))).toThrow(
    /invalid tile name/,
  );
});

test("decode a UInt8 image from a byte range of the file", () => {
  const values = Uint8Array.from({ length: 5 * 3 }, (_, i) => [10, 40, 80][i % 3]);
  const file = encodeGeoTiff({
    width: 5,
    height: 3,
    tileWidth: 4,
    tileHeight: 2,
    values,
    west: 111,
    north: 0,
    scale: 0.6,
  });
  const images = readImages(file);
  const { start, end } = tileRange(images[0]);
  const block = file.slice(start, end);
  const raster = decodeImage(images, 0, (offset, count) =>
    block.subarray(offset - start, offset - start + count),
  );
  expect(raster.values).toBeInstanceOf(Uint8Array);
  expect([...raster.values]).toEqual([...values]);
});

test("read one WorldCover overview with range requests", async () => {
  const source: LandcoverSource = {
    ...WORLDCOVER,
    base: "https://wc.example.test",
    overviewWidth: 6,
  };
  const values = Uint8Array.from({ length: 36 }, (_, i) => (i < 18 ? 10 : 40));
  const file = encodeGeoTiff({
    width: 6,
    height: 6,
    tileWidth: 4,
    tileHeight: 4,
    values,
    west: 111,
    north: 0,
    scale: 0.5,
    pixelIsPoint: false,
  });
  const ranges: string[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    expect(url).toBe(worldcoverUrl(source, "S03E111"));
    const range = new Headers(init?.headers).get("range") ?? "";
    ranges.push(range);
    const [, from, to] = /bytes=(\d+)-(\d+)/.exec(range) ?? [];
    const body = file.slice(Number(from), Math.min(file.length, Number(to) + 1));
    return new Response(body, {
      status: 206,
      headers: { "content-range": `bytes ${from}-${to}/${file.length}`, etag: '"x"' },
    });
  };
  const tile = await readWorldcoverTile(fetch, source, "S03E111", -3, 111, () => new Date(0));
  expect([...tile.values]).toEqual([...values]);
  expect(ranges).toHaveLength(2);
  expect(tile.record).toMatchObject({ name: "S03E111", image: 0, width: 6, etag: '"x"' });
});

test("keep Natural Earth features that touch Indonesia", () => {
  const line = (coordinates: number[][], name: string) => ({
    properties: { name, scalerank: 3 },
    geometry: { type: "LineString", coordinates },
  });
  const selected = selectFeatures(
    {
      rivers: [
        line(
          [
            [101, -1],
            [101.5, -1.2],
          ],
          "Inside",
        ),
        line(
          [
            [103, -1],
            [103.5, -1],
          ],
          "Neighbour",
        ),
      ],
      lakes: [
        {
          properties: { name: "Lake", scalerank: 2 },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [100.5, -0.5],
                [100.6, -0.5],
                [100.6, -0.6],
                [100.5, -0.5],
              ],
            ],
          },
        },
      ],
      places: [
        {
          properties: {
            name: "Kota",
            scalerank: 4,
            pop_max: 10,
            longitude: 101,
            latitude: -1,
            featurecla: "Admin-1 capital",
          },
        },
        {
          properties: {
            name: "Jauh",
            scalerank: 1,
            pop_max: 10,
            longitude: 103,
            latitude: -1,
            adm0cap: 1,
          },
        },
      ],
    },
    OUTLINES,
    10,
  );
  expect(selected.rivers.map(({ name, points }) => [name, points])).toEqual([
    ["Inside", [101, -1, 101.5, -1.2]],
  ]);
  expect(selected.lakes.map(({ name }) => name)).toEqual(["Lake"]);
  expect(selected.places).toEqual([
    { name: "Kota", rank: 4, population: 10, capital: "provinsi", longitude: 101, latitude: -1 },
  ]);
});

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("make a detail patch from cached DEM and land cover tiles", () => {
  const root = mkdtempSync(join(tmpdir(), "kawal-seed-detail-"));
  roots.push(root);
  mkdirSync(join(root, "dem/cache/synthetic-dem"), { recursive: true });
  const dem = {
    createdAt: "2026-10-18T12:00:00.000Z",
    notice: "Synthetic",
    licenceNotice: "Synthetic",
    source: {
      id: "synthetic-dem",
      product: "Synthetic",
      surface: "DSM",
      horizontal: "WGS 84",
      vertical: "EGM2008",
    },
    grid: {
      west: 99,
      north: 1,
      cell: 1 / 120,
      width: 480,
      height: 360,
      nodata: -32768,
      cellArcSec: 30,
    },
    counts: { minimum: 0, maximum: 100 },
    tiles: [{ name: "a" }],
  };
  writeFileSync(join(root, "dem/indonesia-glo90-30s.json"), JSON.stringify(dem));
  writeFileSync(join(root, "dem/indonesia-glo90-30s.i16"), new Uint8Array(480 * 360 * 2));
  // One GLO-90 tile, 100..101°E and 1..0°S, at 250 m everywhere.
  writeFileSync(
    join(root, "dem/cache/synthetic-dem/Copernicus_DSM_COG_30_S01_00_E100_00_DEM.tif"),
    encodeGeoTiff({
      width: 1200,
      height: 1200,
      tileWidth: 1024,
      tileHeight: 1024,
      values: new Float32Array(1200 * 1200).fill(250),
      west: 100,
      north: 0,
      scale: 1 / 1200,
    }),
  );
  // One WorldCover overview tile, 99..102°E and 3..0°S: class 40 everywhere.
  const cover = landcoverCacheFile(root, WORLDCOVER, "S03E099");
  mkdirSync(join(cover, ".."), { recursive: true });
  writeFileSync(cover, new Uint8Array(WORLDCOVER.overviewWidth ** 2).fill(40));

  const { heights, landcover } = decodeDetail(
    buildDetail(root, 99, 0, OUTLINES, 10).slice().buffer,
  );
  const at = (longitude: number, latitude: number) => {
    const index =
      Math.floor((0 - latitude) * (DETAIL_SIZE / 2)) * DETAIL_SIZE +
      Math.floor((longitude - 99) * (DETAIL_SIZE / 2));
    return [heights[index], landcover[index]];
  };
  expect(at(100.5, -0.5)).toEqual([250, 40]); // DEM tile, inside Indonesia
  expect(at(100.5, -1.5)).toEqual([0, 40]); // no DEM tile: sea level
  expect(at(99.5, -0.5)).toEqual([-32768, 0]); // outside Indonesia

  const preview = buildPreview(root, OUTLINES);
  expect(preview.meta.detail).toBe(true);
  const detail = () => new Uint8Array(1);
  const query = (value: string) => new URLSearchParams(value);
  expect(previewResponse(preview, "/detail.bin", query("west=99&north=0"), detail)).toMatchObject({
    status: 200,
  });
  for (const value of [
    "west=99.5&north=0",
    "west=98&north=0",
    "west=102&north=0",
    "west=99&north=2",
  ]) {
    expect(previewResponse(preview, "/detail.bin", query(value), detail)).toMatchObject({
      status: 400,
    });
  }
});

test("keep no data, not water, for empty cells in an indexed tile", async () => {
  const root = mkdtempSync(join(tmpdir(), "kawal-seed-landcover-"));
  roots.push(root);
  const source: LandcoverSource = {
    ...WORLDCOVER,
    base: "https://wc.example.test",
    overviewWidth: 6,
  };
  const file = encodeGeoTiff({
    width: 6,
    height: 6,
    tileWidth: 4,
    tileHeight: 4,
    values: new Uint8Array(36),
    west: 99,
    north: 3,
    scale: 0.5,
    pixelIsPoint: false,
  });
  const fetch = async (url: string, init?: RequestInit) => {
    if (url.endsWith(source.gridIndex)) {
      return new Response(JSON.stringify({ features: [{ properties: { ll_tile: "N00E099" } }] }));
    }
    const range = new Headers(init?.headers).get("range") ?? "";
    const [, from, to] = /bytes=(\d+)-(\d+)/.exec(range) ?? [];
    return new Response(file.slice(Number(from), Math.min(file.length, Number(to) + 1)), {
      status: 206,
      headers: { "content-range": `bytes ${from}-${to}/${file.length}` },
    });
  };
  const outlines: Outlines = {
    indonesia: rings([[100, 0, 102, 0, 102, 2, 100, 2]]),
    neighbours: [],
    source: { name: "Synthetic square", file: "test", sha256: "0".repeat(64) },
  };
  const seed = await runLandcoverSeed({
    outDir: root,
    source,
    fetch,
    outlines,
    cellArcSec: 1800,
    bufferKm: 0,
    concurrency: 1,
  });
  expect([...readFileSync(join(root, "landcover", seed.grid.file))]).toEqual(
    Array.from({ length: 16 }, () => 0),
  );
  expect(seed.counts.classes).not.toHaveProperty("80");
});

test("rebuild a cached detail patch after its land cover seed changes", () => {
  const root = mkdtempSync(join(tmpdir(), "kawal-seed-detail-cache-"));
  roots.push(root);
  const outlines: Outlines = {
    indonesia: rings([[100, 0, 102, 0, 102, 2, 100, 2]]),
    neighbours: [],
    source: { name: "Synthetic square", file: "test", sha256: "0".repeat(64) },
  };
  let builds = 0;
  const cached = detailCache(root, (dir, west, north) => {
    builds++;
    return buildDetail(dir, west, north, outlines, 0);
  });
  const centre = 600 * DETAIL_SIZE + 600;
  const classAt = () => decodeDetail(cached(100, 2).slice().buffer).landcover[centre];
  expect(classAt()).toBe(0);
  expect(classAt()).toBe(0);
  expect(builds).toBe(1);

  const cover = landcoverCacheFile(root, WORLDCOVER, "N00E099");
  mkdirSync(join(cover, ".."), { recursive: true });
  writeFileSync(cover, new Uint8Array(WORLDCOVER.overviewWidth ** 2).fill(40));
  expect(classAt()).toBe(40);
  expect(builds).toBe(2);
});
