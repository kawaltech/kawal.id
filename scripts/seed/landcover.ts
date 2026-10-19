// Local seed of ESA WorldCover 2021 (v200) land cover over Indonesia. Each
// 3-degree source tile is a 10 m Cloud Optimized GeoTIFF of about 35 MB. The
// seed reads only one internal overview (2250 px per tile, about 150 m) with
// HTTP range requests, keeps it in a local cache, and makes a 30″ grid of the
// majority class, masked to Indonesia. For local inspection only.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LANDCOVER_CLASSES } from "../../app/design/indonesia-data.ts";
import { type Grid, type Outlines, indonesiaMask, readOutlines } from "./boundary.ts";
import { demGrid } from "./dem.ts";
import { type Fetch, download, sha256, writeFileAtomic } from "./files.ts";
import { decodeImage, imageWidth, readImages, tileRange } from "./geotiff.ts";
import { encodePng } from "./png.ts";

export interface LandcoverSource {
  id: string;
  product: string;
  base: string;
  gridIndex: string;
  tileDegrees: number;
  /** Width of the overview image to read, in pixels per tile. */
  overviewWidth: number;
}

export const WORLDCOVER: LandcoverSource = {
  id: "esa-worldcover-v200-2021",
  product: "ESA WorldCover 10 m 2021 v200 (overview of about 150 m)",
  base: "https://esa-worldcover.s3.eu-central-1.amazonaws.com",
  gridIndex: "esa_worldcover_grid.geojson",
  tileDegrees: 3,
  overviewWidth: 2250,
};

// Attribution text published by the ESA WorldCover project. The licence is
// reported as CC BY 4.0; check the licence text before any distribution.
export const WORLDCOVER_NOTICE =
  "© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium.";

/** WorldCover class values. 0 is nodata. */
export const LANDCOVER_VALUES = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100] as const;
const INDEX = new Uint8Array(256).fill(0);
LANDCOVER_VALUES.forEach((value, i) => (INDEX[value] = i));

export interface LandcoverTileRecord {
  name: string;
  url: string;
  etag: string | null;
  lastModified: string | null;
  image: number;
  width: number;
  range: [number, number];
  blockSha256: string;
  rasterSha256: string;
  retrievedAt: string;
}

export interface LandcoverSeed {
  kind: "kawal-local-seed/landcover";
  schemaVersion: 1;
  synthetic: false;
  notice: string;
  licenceNotice: string;
  createdAt: string;
  source: {
    id: string;
    product: string;
    gridIndex: { url: string; sha256: string; retrievedAt: string };
  };
  grid: Grid & {
    south: number;
    east: number;
    cellArcSec: number;
    file: string;
    dtype: "uint8";
    rowOrder: "north-to-south";
    nodata: 0;
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
    classes: Record<string, number>;
  };
  tiles: LandcoverTileRecord[];
}

/** WorldCover tile name. The name gives the south-west corner of the 3-degree tile. */
export function worldcoverName(south: number, west: number): string {
  const lat = `${south < 0 ? "S" : "N"}${String(Math.abs(south)).padStart(2, "0")}`;
  const lon = `${west < 0 ? "W" : "E"}${String(Math.abs(west)).padStart(3, "0")}`;
  return `${lat}${lon}`;
}

export function worldcoverUrl(source: LandcoverSource, name: string): string {
  return `${source.base}/v200/2021/map/ESA_WorldCover_10m_2021_v200_${name}_Map.tif`;
}

/** Tile names from the WorldCover grid index. Ocean areas have no tile. */
export function parseWorldcoverGrid(text: string): Set<string> {
  const data = JSON.parse(text) as { features?: { properties?: { ll_tile?: unknown } }[] };
  if (!Array.isArray(data.features)) throw new Error("The WorldCover grid index has no features");
  const names = new Set<string>();
  for (const feature of data.features) {
    const name = feature.properties?.ll_tile;
    if (typeof name !== "string" || !/^[NS]\d{2}[EW]\d{3}$/.test(name)) {
      throw new Error("The WorldCover grid index has an invalid tile name");
    }
    names.add(name);
  }
  return names;
}

/**
 * Majority class of the source pixels whose centres are in each output cell.
 * Nodata (0) wins only when a cell has no other class.
 */
export function majorityClasses(values: Uint8Array, size: number, cells: number): Uint8Array {
  const result = new Uint8Array(cells * cells);
  const counts = new Uint32Array(cells * LANDCOVER_VALUES.length);
  let row = 0;
  for (let cellRow = 0; cellRow < cells; cellRow++) {
    counts.fill(0);
    for (; row < size && Math.floor(((row + 0.5) * cells) / size) === cellRow; row++) {
      for (let col = 0; col < size; col++) {
        const cell = Math.floor(((col + 0.5) * cells) / size);
        counts[cell * LANDCOVER_VALUES.length + INDEX[values[row * size + col]]]++;
      }
    }
    for (let cell = 0; cell < cells; cell++) {
      let best = 0;
      let most = 0;
      for (let k = 1; k < LANDCOVER_VALUES.length; k++) {
        const count = counts[cell * LANDCOVER_VALUES.length + k];
        if (count > most) {
          most = count;
          best = k;
        }
      }
      result[cellRow * cells + cell] = LANDCOVER_VALUES[best];
    }
  }
  return result;
}

async function range(fetch: Fetch, url: string, start: number, end: number) {
  let failure: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { range: `bytes=${start}-${end - 1}` },
        signal: AbortSignal.timeout(120_000),
      });
      if (response.status !== 206) {
        await response.body?.cancel();
        throw new Error(`${url} returned HTTP ${response.status} for a range request`);
      }
      const body = new Uint8Array(await response.arrayBuffer());
      // A range past the end of the file returns only the bytes that exist.
      const total = Number(/\/(\d+)$/.exec(response.headers.get("content-range") ?? "")?.[1]);
      const expected = (Number.isFinite(total) ? Math.min(end, total) : end) - start;
      if (body.length !== expected)
        throw new Error(`${url} returned ${body.length} of ${expected} bytes`);
      return {
        body,
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
      };
    } catch (error) {
      failure = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
  throw failure;
}

/** Read the overview of one tile with two range requests: the IFDs, then the overview tiles. */
export async function readWorldcoverTile(
  fetch: Fetch,
  source: LandcoverSource,
  name: string,
  south: number,
  west: number,
  now: () => Date,
): Promise<{ values: Uint8Array; record: LandcoverTileRecord }> {
  const url = worldcoverUrl(source, name);
  let header: Awaited<ReturnType<typeof range>> | null = null;
  let images: ReturnType<typeof readImages> | null = null;
  for (const length of [65_536, 1_048_576]) {
    header = await range(fetch, url, 0, length);
    try {
      images = readImages(header.body);
      break;
    } catch (error) {
      if (length > 65_536) throw error;
    }
  }
  if (!header || !images) throw new Error(`${name}: cannot read the TIFF header`);
  const image = images.findIndex((tags) => imageWidth(tags) === source.overviewWidth);
  if (image < 0) throw new Error(`${name} has no ${source.overviewWidth} px overview`);
  const { start, end } = tileRange(images[image]);
  const block = await range(fetch, url, start, end);
  if (header.etag && block.etag && header.etag !== block.etag)
    throw new Error(`${name} changed during the download`);
  const raster = decodeImage(images, image, (offset, count) =>
    block.body.subarray(offset - start, offset - start + count),
  );
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  if (
    !(raster.values instanceof Uint8Array) ||
    raster.width !== source.overviewWidth ||
    raster.height !== source.overviewWidth ||
    raster.epsg !== 4326 ||
    !close(raster.west, west) ||
    !close(raster.north, south + source.tileDegrees) ||
    !close(raster.scaleX * raster.width, source.tileDegrees)
  ) {
    throw new Error(`${name} does not have the expected grid`);
  }
  return {
    values: raster.values,
    record: {
      name,
      url,
      etag: block.etag,
      lastModified: block.lastModified,
      image,
      width: raster.width,
      range: [start, end],
      blockSha256: sha256(block.body),
      rasterSha256: sha256(raster.values),
      retrievedAt: now().toISOString(),
    },
  };
}

const COLOURS = new Map(LANDCOVER_CLASSES.map(({ value, colour }) => [value, colour]));

/** Cache file for one decoded overview. */
export const landcoverCacheFile = (outDir: string, source: LandcoverSource, name: string) =>
  join(outDir, "landcover/cache", source.id, `${name}-${source.overviewWidth}.u8`);

/** Download (or reuse) the overviews that touch Indonesia, then write the masked 30″ grid. */
export async function runLandcoverSeed(options: {
  outDir: string;
  fetch?: Fetch;
  now?: () => Date;
  source?: LandcoverSource;
  outlines?: Outlines;
  cellArcSec?: number;
  bufferKm?: number;
  concurrency?: number;
  log?: (message: string) => void;
}): Promise<LandcoverSeed> {
  const {
    outDir,
    fetch = globalThis.fetch,
    now = () => new Date(),
    source = WORLDCOVER,
    cellArcSec = 30,
    bufferKm = 10,
    concurrency = 6,
    log = () => {},
  } = options;
  const outlines = options.outlines ?? readOutlines();
  const { bounds, grid, perDegree } = demGrid(outlines, cellArcSec, bufferKm);
  const mask = indonesiaMask(outlines, grid, bufferKm);
  const step = source.tileDegrees;
  const cellsPerTile = step * perDegree;

  const index = await download(fetch, `${source.base}/${source.gridIndex}`, { now });
  const available = parseWorldcoverGrid(index.body.toString("utf8"));
  const wanted: { name: string; south: number; west: number; ocean: boolean }[] = [];
  for (let south = Math.floor(bounds.south / step) * step; south < bounds.north; south += step) {
    for (let west = Math.floor(bounds.west / step) * step; west < bounds.east; west += step) {
      let touches = false;
      for (let r = 0; r < cellsPerTile && !touches; r++) {
        const row = Math.round((grid.north - (south + step)) * perDegree) + r;
        if (row < 0 || row >= grid.height) continue;
        const first = Math.max(0, Math.round((west - grid.west) * perDegree));
        const last = Math.min(grid.width, Math.round((west + step - grid.west) * perDegree));
        if (first < last)
          touches = mask.subarray(row * grid.width + first, row * grid.width + last).includes(1);
      }
      if (!touches) continue;
      const name = worldcoverName(south, west);
      wanted.push({ name, south, west, ocean: !available.has(name) });
    }
  }

  const classes = new Uint8Array(grid.width * grid.height);
  const place = (tile: { south: number; west: number }, cells: Uint8Array | null) => {
    for (let r = 0; r < cellsPerTile; r++) {
      const row = Math.round((grid.north - (tile.south + step)) * perDegree) + r;
      if (row < 0 || row >= grid.height) continue;
      for (let c = 0; c < cellsPerTile; c++) {
        const col = Math.round((tile.west - grid.west) * perDegree) + c;
        if (col < 0 || col >= grid.width || !mask[row * grid.width + col]) continue;
        // Ocean areas have no tile: show them as water. A cell without a valid
        // class in an indexed tile keeps 0 (no data).
        classes[row * grid.width + col] = cells ? cells[r * cellsPerTile + c] : 80;
      }
    }
  };
  for (const tile of wanted.filter(({ ocean }) => ocean)) place(tile, null);

  const manifestPath = join(outDir, "landcover/cache", source.id, "manifest.json");
  const manifest: Record<string, LandcoverTileRecord> = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, "utf8"))
    : {};
  const land = wanted.filter(({ ocean }) => !ocean);
  log(`${land.length} land tiles and ${wanted.length - land.length} ocean tiles touch Indonesia`);
  const counts = { downloaded: 0, reused: 0, done: 0 };
  const queue = [...land];
  async function worker() {
    for (let tile = queue.shift(); tile; tile = queue.shift()) {
      const path = landcoverCacheFile(outDir, source, tile.name);
      const record = manifest[tile.name];
      let values: Uint8Array | null = null;
      if (record && existsSync(path)) {
        const cached = new Uint8Array(readFileSync(path));
        if (cached.length === source.overviewWidth ** 2 && sha256(cached) === record.rasterSha256) {
          values = cached;
          counts.reused++;
        }
      }
      if (!values) {
        const result = await readWorldcoverTile(
          fetch,
          source,
          tile.name,
          tile.south,
          tile.west,
          now,
        );
        values = result.values;
        writeFileAtomic(path, values);
        manifest[tile.name] = result.record;
        writeFileAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        counts.downloaded++;
      }
      place(tile, majorityClasses(values, source.overviewWidth, cellsPerTile));
      if (++counts.done % 10 === 0 || counts.done === land.length) {
        log(
          `${counts.done}/${land.length} tiles (${counts.downloaded} downloaded, ${counts.reused} reused)`,
        );
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  const totals: Record<string, number> = {};
  let indonesiaCells = 0;
  for (let i = 0; i < classes.length; i++) {
    if (!mask[i]) continue;
    indonesiaCells++;
    totals[classes[i]] = (totals[classes[i]] ?? 0) + 1;
  }
  const base = `landcover/indonesia-worldcover-${cellArcSec}s`;
  const seed: LandcoverSeed = {
    kind: "kawal-local-seed/landcover",
    schemaVersion: 1,
    synthetic: false,
    notice:
      "Local seed only. Land cover is a classification of 2021 satellite images, not a current map or a legal boundary. Do not commit, publish, or use these files in tests or builds.",
    licenceNotice: WORLDCOVER_NOTICE,
    createdAt: now().toISOString(),
    source: {
      id: source.id,
      product: source.product,
      gridIndex: { url: index.url, sha256: index.sha256, retrievedAt: index.retrievedAt },
    },
    grid: {
      ...grid,
      south: bounds.south,
      east: bounds.east,
      cellArcSec,
      file: `${base.split("/").at(-1)}.u8`,
      dtype: "uint8",
      rowOrder: "north-to-south",
      nodata: 0,
      value:
        "Majority WorldCover class of the overview pixels whose centres are in the cell. Cells outside Indonesia, and cells without a valid class in an indexed tile, have 0. Ocean areas without a tile have class 80 (water).",
    },
    boundary: { ...outlines.source, bufferKm },
    counts: {
      cells: classes.length,
      indonesiaCells,
      tiles: wanted.length,
      tilesDownloaded: counts.downloaded,
      tilesReused: counts.reused,
      oceanTiles: wanted.length - land.length,
      classes: totals,
    },
    tiles: land.map(({ name }) => manifest[name]).sort((a, b) => a.name.localeCompare(b.name)),
  };
  const step2 = Math.max(1, Math.ceil(grid.width / 1600));
  const w = Math.floor(grid.width / step2);
  const h = Math.floor(grid.height / step2);
  const rgb = new Uint8Array(w * h * 3);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      rgb.set(
        COLOURS.get(classes[row * step2 * grid.width + col * step2]) ?? [236, 236, 232],
        (row * w + col) * 3,
      );
    }
  }
  writeFileAtomic(join(outDir, `${base}.u8`), classes);
  writeFileAtomic(join(outDir, `${base}.png`), encodePng(w, h, rgb));
  writeFileAtomic(join(outDir, `${base}.json`), `${JSON.stringify(seed, null, 2)}\n`);
  return seed;
}
