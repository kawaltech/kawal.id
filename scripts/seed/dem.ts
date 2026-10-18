// Local seed of Copernicus DEM GLO-90 elevation over Indonesia. The source is a
// surface model (DSM): in forest, a height can show the top of the canopy. The
// seed is for local inspection only. ADR 0010 is a proposal: do not publish the
// tiles or derived files before an accepted terrain decision.
import { existsSync, readFileSync } from "node:fs";
import { endianness } from "node:os";
import { join } from "node:path";
import {
  type Grid,
  type Outlines,
  indonesiaBounds,
  indonesiaMask,
  readOutlines,
} from "./boundary.ts";
import { type Fetch, download, sha256, writeFileAtomic } from "./files.ts";
import { readGeoTiff } from "./geotiff.ts";
import { encodePng } from "./png.ts";

export interface DemSource {
  id: string;
  product: string;
  base: string;
  prefix: string;
  /** Samples per degree in both directions, below 50 degrees latitude. */
  samplesPerDegree: number;
}

export const GLO90: DemSource = {
  id: "copernicus-dem-glo90-dged-cog",
  product: "Copernicus DEM GLO-90 (DGED), Cloud Optimized GeoTIFF on AWS Open Data",
  base: "https://copernicus-dem-90m.s3.amazonaws.com",
  prefix: "Copernicus_DSM_COG_30",
  samplesPerDegree: 1200,
};

// From the GLO-30 licence quoted in ADR 0010, with "90" for this product. The
// GLO-90 licence text was not checked for this seed. Check it before any
// distribution of tiles or derived files.
export const COPERNICUS_NOTICE =
  "Produced using Copernicus WorldDEM-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved. The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-90.";

export const NODATA = -32768;

export interface TileRecord {
  name: string;
  url: string;
  sha256: string;
  bytes: number;
  etag: string | null;
  lastModified: string | null;
  retrievedAt: string;
}

export interface DemSeed {
  kind: "kawal-local-seed/dem";
  schemaVersion: 1;
  synthetic: false;
  notice: string;
  licenceNotice: string;
  createdAt: string;
  source: {
    id: string;
    product: string;
    surface: string;
    horizontal: string;
    vertical: string;
    tileList: { url: string; sha256: string; retrievedAt: string };
  };
  grid: Grid & {
    south: number;
    east: number;
    cellArcSec: number;
    file: string;
    dtype: "int16";
    byteOrder: "little-endian";
    rowOrder: "north-to-south";
    nodata: number;
    units: "m";
    value: string;
  };
  boundary: Outlines["source"] & { bufferKm: number };
  counts: {
    cells: number;
    indonesiaCells: number;
    tiles: number;
    tilesDownloaded: number;
    tilesReused: number;
    oceanTiles: number;
    minimum: number | null;
    maximum: number | null;
  };
  tiles: TileRecord[];
}

/** Copernicus tile name. The name gives the south-west corner of the 1-degree tile. */
export function tileName(source: DemSource, south: number, west: number): string {
  const lat = `${south < 0 ? "S" : "N"}${String(Math.abs(south)).padStart(2, "0")}`;
  const lon = `${west < 0 ? "W" : "E"}${String(Math.abs(west)).padStart(3, "0")}`;
  return `${source.prefix}_${lat}_00_${lon}_00_DEM`;
}

export function tileUrl(source: DemSource, name: string): string {
  return `${source.base}/${name}/${name}.tif`;
}

/** Parse the bucket tile list. Ocean areas have no tile. */
export function parseTileList(source: DemSource, text: string): Set<string> {
  const pattern = new RegExp(`^${source.prefix}_[NS]\\d{2}_00_[EW]\\d{3}_00_DEM$`);
  const names = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const invalid = names.find((name) => !pattern.test(name));
  if (invalid !== undefined) throw new Error(`Unexpected tile list entry: ${invalid.slice(0, 80)}`);
  return new Set(names);
}

/** Mean of each `factor` x `factor` block of valid samples, or NaN for a block without one. */
export function blockMeans(
  values: Float32Array,
  size: number,
  factor: number,
  nodata: number | null,
): Float32Array {
  const blocks = size / factor;
  const sums = new Float64Array(blocks * blocks);
  const counts = new Uint32Array(blocks * blocks);
  for (let row = 0; row < size; row++) {
    const target = Math.floor(row / factor) * blocks;
    for (let col = 0; col < size; col++) {
      const value = values[row * size + col];
      if (Number.isNaN(value) || value === nodata) continue;
      const index = target + Math.floor(col / factor);
      sums[index] += value;
      counts[index]++;
    }
  }
  return Float32Array.from(sums, (sum, index) => (counts[index] ? sum / counts[index] : NaN));
}

/** Whole-degree grid around Indonesia with `cellArcSec` cells. */
export function demGrid(outlines: Outlines, cellArcSec: number, bufferKm: number) {
  const bounds = indonesiaBounds(outlines, bufferKm);
  const perDegree = 3600 / cellArcSec;
  const grid: Grid = {
    west: bounds.west,
    north: bounds.north,
    cell: cellArcSec / 3600,
    width: (bounds.east - bounds.west) * perDegree,
    height: (bounds.north - bounds.south) * perDegree,
  };
  return { bounds, grid, perDegree };
}

function colour(value: number): [number, number, number] {
  if (value === NODATA) return [236, 236, 232];
  if (value <= 0) return [178, 204, 222];
  const stops: [number, [number, number, number]][] = [
    [0, [74, 128, 84]],
    [200, [146, 172, 98]],
    [800, [196, 170, 110]],
    [2000, [150, 112, 82]],
    [5000, [250, 250, 250]],
  ];
  for (let i = 1; i < stops.length; i++) {
    const [to, high] = stops[i];
    const [from, low] = stops[i - 1];
    if (value <= to || i === stops.length - 1) {
      const t = Math.min(1, (value - from) / (to - from));
      return [0, 1, 2].map((k) => Math.round(low[k] + t * (high[k] - low[k]))) as [
        number,
        number,
        number,
      ];
    }
  }
  return [250, 250, 250];
}

/** Nearest-sample colour preview, at most `maxWidth` pixels wide. */
export function previewPng(heights: Int16Array, width: number, height: number, maxWidth = 1600) {
  const step = Math.max(1, Math.ceil(width / maxWidth));
  const w = Math.floor(width / step);
  const h = Math.floor(height / step);
  const rgb = new Uint8Array(w * h * 3);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      rgb.set(colour(heights[row * step * width + col * step]), (row * w + col) * 3);
    }
  }
  return encodePng(w, h, rgb);
}

/**
 * Download the GLO-90 tiles that touch Indonesia into a local cache, then make
 * one national grid masked to Indonesia. Cached tiles with a matching SHA-256
 * are reused, so a stopped run can continue.
 */
export async function runDemSeed(options: {
  outDir: string;
  fetch?: Fetch;
  now?: () => Date;
  source?: DemSource;
  outlines?: Outlines;
  cellArcSec?: number;
  bufferKm?: number;
  concurrency?: number;
  log?: (message: string) => void;
}): Promise<DemSeed> {
  const {
    outDir,
    fetch = globalThis.fetch,
    now = () => new Date(),
    source = GLO90,
    cellArcSec = 30,
    bufferKm = 10,
    concurrency = 6,
    log = () => {},
  } = options;
  const sampleArcSec = 3600 / source.samplesPerDegree;
  const factor = cellArcSec / sampleArcSec;
  if (!Number.isInteger(factor) || factor < 1 || source.samplesPerDegree % factor !== 0) {
    throw new Error(
      `The cell size must be a whole multiple of ${sampleArcSec}″ that divides 1 degree`,
    );
  }
  const outlines = options.outlines ?? readOutlines();
  const { bounds, grid, perDegree } = demGrid(outlines, cellArcSec, bufferKm);
  const mask = indonesiaMask(outlines, grid, bufferKm);

  const list = await download(fetch, `${source.base}/tileList.txt`, { now });
  const available = parseTileList(source, list.body.toString("utf8"));
  const wanted: { name: string; row: number; col: number; ocean: boolean }[] = [];
  for (let row = 0; row < bounds.north - bounds.south; row++) {
    for (let col = 0; col < bounds.east - bounds.west; col++) {
      let touches = false;
      for (let r = 0; r < perDegree && !touches; r++) {
        const start = (row * perDegree + r) * grid.width + col * perDegree;
        touches = mask.subarray(start, start + perDegree).includes(1);
      }
      if (!touches) continue;
      const name = tileName(source, bounds.north - row - 1, bounds.west + col);
      wanted.push({ name, row, col, ocean: !available.has(name) });
    }
  }

  const cache = join(outDir, "dem/cache", source.id);
  const manifestPath = join(cache, "manifest.json");
  const manifest: Record<string, TileRecord> = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, "utf8"))
    : {};
  const heights = new Int16Array(grid.width * grid.height).fill(NODATA);
  const counts = { downloaded: 0, reused: 0, done: 0 };
  const land = wanted.filter(({ ocean }) => !ocean);
  log(`${land.length} land tiles and ${wanted.length - land.length} ocean tiles touch Indonesia`);

  for (const tile of wanted.filter(({ ocean }) => ocean)) {
    for (let r = 0; r < perDegree; r++) {
      const start = (tile.row * perDegree + r) * grid.width + tile.col * perDegree;
      for (let i = start; i < start + perDegree; i++) if (mask[i]) heights[i] = 0;
    }
  }

  async function tileBytes(name: string): Promise<Uint8Array> {
    const path = join(cache, `${name}.tif`);
    const record = manifest[name];
    if (record && existsSync(path)) {
      const body = readFileSync(path);
      if (body.length === record.bytes && sha256(body) === record.sha256) {
        counts.reused++;
        return body;
      }
    }
    const file = await download(fetch, tileUrl(source, name), { now });
    writeFileAtomic(path, file.body);
    manifest[name] = {
      name,
      url: file.url,
      sha256: file.sha256,
      bytes: file.bytes,
      etag: file.etag,
      lastModified: file.lastModified,
      retrievedAt: file.retrievedAt,
    };
    writeFileAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    counts.downloaded++;
    return file.body;
  }

  const queue = [...land];
  async function worker() {
    for (let tile = queue.shift(); tile; tile = queue.shift()) {
      const raster = readGeoTiff(await tileBytes(tile.name));
      const south = bounds.north - tile.row - 1;
      const west = bounds.west + tile.col;
      const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;
      if (
        raster.width !== source.samplesPerDegree ||
        raster.height !== source.samplesPerDegree ||
        !raster.pixelIsPoint ||
        raster.epsg !== 4326 ||
        !close(raster.west, west) ||
        !close(raster.north, south + 1) ||
        !close(raster.scaleX * source.samplesPerDegree, 1) ||
        !close(raster.scaleY * source.samplesPerDegree, 1)
      ) {
        throw new Error(`${tile.name} does not have the expected grid`);
      }
      const means = blockMeans(raster.values, source.samplesPerDegree, factor, raster.nodata);
      for (let r = 0; r < perDegree; r++) {
        const start = (tile.row * perDegree + r) * grid.width + tile.col * perDegree;
        for (let c = 0; c < perDegree; c++) {
          const mean = means[r * perDegree + c];
          if (mask[start + c] && !Number.isNaN(mean)) heights[start + c] = Math.round(mean);
        }
      }
      if (++counts.done % 25 === 0 || counts.done === land.length) {
        log(
          `${counts.done}/${land.length} tiles (${counts.downloaded} downloaded, ${counts.reused} reused)`,
        );
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  let minimum = Infinity;
  let maximum = -Infinity;
  let indonesiaCells = 0;
  for (let i = 0; i < heights.length; i++) {
    if (!mask[i]) continue;
    indonesiaCells++;
    if (heights[i] === NODATA) continue;
    minimum = Math.min(minimum, heights[i]);
    maximum = Math.max(maximum, heights[i]);
  }
  const base = `dem/indonesia-glo90-${cellArcSec}s`;
  const seed: DemSeed = {
    kind: "kawal-local-seed/dem",
    schemaVersion: 1,
    synthetic: false,
    notice:
      "Local seed only. Surface model: in forest, a height can show the top of the canopy. Do not commit, publish, or use these files in tests or builds.",
    licenceNotice: COPERNICUS_NOTICE,
    createdAt: now().toISOString(),
    source: {
      id: source.id,
      product: source.product,
      surface: "DSM (includes vegetation and buildings)",
      horizontal: "WGS 84 geographic (EPSG:4326)",
      vertical: "EGM2008 geoid heights in metres",
      tileList: { url: list.url, sha256: list.sha256, retrievedAt: list.retrievedAt },
    },
    grid: {
      ...grid,
      south: bounds.south,
      east: bounds.east,
      cellArcSec,
      file: `${base.split("/").at(-1)}.i16`,
      dtype: "int16",
      byteOrder: "little-endian",
      rowOrder: "north-to-south",
      nodata: NODATA,
      units: "m",
      value: `Rounded mean of the ${factor * factor} source samples whose centres are in the cell (west and north cell edges inclusive). Cells outside Indonesia have nodata. Cells in ocean areas without a tile have 0.`,
    },
    boundary: { ...outlines.source, bufferKm },
    counts: {
      cells: heights.length,
      indonesiaCells,
      tiles: wanted.length,
      tilesDownloaded: counts.downloaded,
      tilesReused: counts.reused,
      oceanTiles: wanted.length - land.length,
      minimum: Number.isFinite(minimum) ? minimum : null,
      maximum: Number.isFinite(maximum) ? maximum : null,
    },
    tiles: land.map(({ name }) => manifest[name]).sort((a, b) => a.name.localeCompare(b.name)),
  };
  if (endianness() !== "LE") throw new Error("The grid writer needs a little-endian host");
  writeFileAtomic(join(outDir, `${base}.i16`), new Uint8Array(heights.buffer));
  writeFileAtomic(join(outDir, `${base}.png`), previewPng(heights, grid.width, grid.height));
  writeFileAtomic(join(outDir, `${base}.json`), `${JSON.stringify(seed, null, 2)}\n`);
  return seed;
}
