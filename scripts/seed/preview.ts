// Development-only data for /rancangan/d/indonesia. The Vite plugin below runs
// only in the development server (`apply: "serve"`). It reads the ignored
// .data/seed files and never writes. The static build does not run it, so no
// seed data enters apps/public/dist.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import {
  type DetectionInput,
  type PreviewMeta,
  DETAIL_DEGREES,
  DETAIL_NODATA,
  DETAIL_SIZE,
  GROUPS,
  PREVIEW_BASE,
  detailGrid,
  encodeDetections,
} from "../../app/design/indonesia-data.ts";
import {
  type Outlines,
  type Ring,
  distanceKm,
  indonesiaMask,
  inside,
  readOutlines,
} from "./boundary.ts";
import { type DemSeed, GLO90, blockMeans, tileName } from "./dem.ts";
import { FEATURES_SEED_FILE, type FeaturesSeed } from "./features.ts";
import { FIRMS_SEED_FILE, type FirmsSeed } from "./firms.ts";
import { readGeoTiff } from "./geotiff.ts";
import { type LandcoverSeed, WORLDCOVER, landcoverCacheFile, worldcoverName } from "./landcover.ts";

// One point inside each of the five largest Indonesia rings, by group index.
const GROUP_POINTS: [number, number, number][] = [
  [0, 110, -7.3],
  [1, 113.5, -1.5],
  [2, 138.5, -4.5],
  [3, 120.3, -2],
  [4, 101.5, -0.5],
];
const OTHER_GROUP = GROUPS.length - 1;
const PREVIEW_ARC_SEC = 30;

/** Island group of each Indonesia ring. */
export function ringGroups(outlines: Outlines): Uint8Array {
  const groups = new Uint8Array(outlines.indonesia.length).fill(OTHER_GROUP);
  for (const [group, longitude, latitude] of GROUP_POINTS) {
    const index = outlines.indonesia.findIndex((ring) => inside([ring], longitude, latitude));
    if (index >= 0) groups[index] = group;
  }
  return groups;
}

/** Group of the ring that contains the point, or of the nearest ring within the buffer. */
export function groupOf(
  rings: readonly Ring[],
  groups: Uint8Array,
  longitude: number,
  latitude: number,
  bufferKm: number,
): number {
  let nearest = OTHER_GROUP;
  let best = Infinity;
  for (let i = 0; i < rings.length; i++) {
    if (inside([rings[i]], longitude, latitude)) return groups[i];
    const distance = distanceKm([rings[i]], longitude, latitude, Math.min(best, bufferKm));
    if (distance < best) {
      best = distance;
      nearest = groups[i];
    }
  }
  return nearest;
}

/** Mean of each `factor` x `factor` block of valid cells. Edge blocks can be smaller. */
export function downsample(
  heights: Int16Array,
  width: number,
  height: number,
  factor: number,
  nodata: number,
) {
  const w = Math.ceil(width / factor);
  const h = Math.ceil(height / factor);
  const result = new Int16Array(w * h);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      let sum = 0;
      let n = 0;
      for (let y = row * factor; y < Math.min(height, (row + 1) * factor); y++) {
        for (let x = col * factor; x < Math.min(width, (col + 1) * factor); x++) {
          const value = heights[y * width + x];
          if (value === nodata) continue;
          sum += value;
          n++;
        }
      }
      result[row * w + col] = n ? Math.round(sum / n) : nodata;
    }
  }
  return { heights: result, width: w, height: h };
}

export interface PreviewPayload {
  meta: PreviewMeta;
  dem: Uint8Array | null;
  firms: Uint8Array | null;
  landcover: Uint8Array | null;
  features: string | null;
}

function demFiles(seedDir: string): { json: string; grid: string } | null {
  const directory = join(seedDir, "dem");
  if (!existsSync(directory)) return null;
  const grids = readdirSync(directory)
    .map((name) => /^indonesia-glo90-(\d+)s\.json$/.exec(name))
    .filter((match) => match !== null)
    .sort((a, b) => Number(a[1]) - Number(b[1]));
  if (!grids.length) return null;
  const json = join(directory, grids[0][0]);
  const grid = json.replace(/\.json$/, ".i16");
  return existsSync(grid) ? { json, grid } : null;
}

const landcoverFiles = (seedDir: string, cellArcSec: number) => {
  const json = join(seedDir, `landcover/indonesia-worldcover-${cellArcSec}s.json`);
  const grid = json.replace(/\.json$/, ".u8");
  return existsSync(json) && existsSync(grid) ? { json, grid } : null;
};

/** Make the preview payloads from the local seed files. Missing seeds give null parts. */
export function buildPreview(seedDir: string, outlines: Outlines = readOutlines()): PreviewPayload {
  const payload: PreviewPayload = {
    meta: {
      schemaVersion: 1,
      firms: null,
      dem: null,
      landcover: null,
      features: null,
      detail: false,
    },
    dem: null,
    firms: null,
    landcover: null,
    features: null,
  };

  const files = demFiles(seedDir);
  if (files) {
    const seed = JSON.parse(readFileSync(files.json, "utf8")) as DemSeed;
    const bytes = readFileSync(files.grid);
    const { grid } = seed;
    if (bytes.length !== grid.width * grid.height * 2)
      throw new Error(`${files.grid} has the wrong size`);
    const source = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
    const factor = Math.max(1, Math.floor(PREVIEW_ARC_SEC / grid.cellArcSec));
    const small = downsample(source, grid.width, grid.height, factor, grid.nodata);
    payload.dem = new Uint8Array(small.heights.buffer);
    payload.meta.dem = {
      createdAt: seed.createdAt,
      product: seed.source.product,
      surface: seed.source.surface,
      horizontal: seed.source.horizontal,
      vertical: seed.source.vertical,
      licenceNotice: seed.licenceNotice,
      notice: seed.notice,
      west: grid.west,
      north: grid.north,
      cell: grid.cell * factor,
      cellArcSec: grid.cellArcSec * factor,
      width: small.width,
      height: small.height,
      nodata: grid.nodata,
      minimum: seed.counts.minimum,
      maximum: seed.counts.maximum,
      tiles: seed.tiles.length,
    };
    payload.meta.detail = existsSync(join(seedDir, "dem/cache", seed.source.id));

    // Land cover is used only on the same grid as the heights.
    const cover = landcoverFiles(seedDir, grid.cellArcSec * factor);
    if (cover) {
      const meta = JSON.parse(readFileSync(cover.json, "utf8")) as LandcoverSeed;
      const same =
        meta.grid.width === small.width &&
        meta.grid.height === small.height &&
        Math.abs(meta.grid.west - grid.west) < 1e-9 &&
        Math.abs(meta.grid.north - grid.north) < 1e-9;
      if (same) {
        payload.landcover = new Uint8Array(readFileSync(cover.grid));
        payload.meta.landcover = {
          createdAt: meta.createdAt,
          product: meta.source.product,
          notice: meta.notice,
          licenceNotice: meta.licenceNotice,
          tiles: meta.tiles.length,
        };
      }
    }
  }

  const featuresFile = join(seedDir, FEATURES_SEED_FILE);
  if (existsSync(featuresFile)) {
    const seed = JSON.parse(readFileSync(featuresFile, "utf8")) as FeaturesSeed;
    payload.features = JSON.stringify({
      rivers: seed.rivers,
      lakes: seed.lakes,
      places: seed.places,
    });
    payload.meta.features = {
      createdAt: seed.createdAt,
      attribution: seed.attribution,
      notice: seed.notice,
      rivers: seed.rivers.length,
      lakes: seed.lakes.length,
      places: seed.places.length,
    };
  }

  const firmsFile = join(seedDir, FIRMS_SEED_FILE);
  if (existsSync(firmsFile)) {
    const seed = JSON.parse(readFileSync(firmsFile, "utf8")) as FirmsSeed;
    const epochMinute = Math.floor(
      (Date.parse(seed.windowEnd) - seed.windowHours * 3_600_000) / 60_000,
    );
    const groups = ringGroups(outlines);
    const list: DetectionInput[] = seed.detections.map((detection) => ({
      longitude: detection.longitude,
      latitude: detection.latitude,
      frp: detection.frp,
      acquiredAt: detection.acquiredAt,
      confidence: detection.confidence,
      satellite: detection.satellite,
      daynight: detection.daynight,
      group: groupOf(
        outlines.indonesia,
        groups,
        detection.longitude,
        detection.latitude,
        seed.boundary.bufferKm,
      ),
    }));
    payload.firms = encodeDetections(list, epochMinute);
    const invalid = Object.values(seed.counts.invalid).reduce((sum, value) => sum + value, 0);
    payload.meta.firms = {
      createdAt: seed.createdAt,
      windowEnd: seed.windowEnd,
      windowHours: seed.windowHours,
      epochMinute,
      count: list.length,
      earliestObservationAt: seed.earliestObservationAt,
      latestObservationAt: seed.latestObservationAt,
      attribution: seed.attribution,
      notice: seed.notice,
      boundary: seed.boundary.name,
      bufferKm: seed.boundary.bufferKm,
      rows: {
        total: seed.counts.rows,
        accepted: seed.counts.accepted,
        outsideIndonesia: seed.counts.outsideIndonesia,
        outsideWindow: seed.counts.outsideWindow,
        invalid,
      },
      sources: seed.sources.map(({ sourceId, url, retrievedAt, lastModified, sha256 }) => ({
        sourceId,
        url,
        retrievedAt,
        lastModified,
        sha256,
      })),
    };
  }
  return payload;
}

/** Rebuild the payloads only when a seed file changes. */
export function previewCache(seedDir: string, build = buildPreview) {
  let key = "";
  let payload: PreviewPayload | null = null;
  return () => {
    const paths = [
      join(seedDir, FIRMS_SEED_FILE),
      join(seedDir, FEATURES_SEED_FILE),
      ...Object.values(demFiles(seedDir) ?? {}),
      ...Object.values(landcoverFiles(seedDir, PREVIEW_ARC_SEC) ?? {}),
    ];
    const next = paths
      .map((path) => (existsSync(path) ? `${path}:${statSync(path).mtimeMs}` : path))
      .join("|");
    if (!payload || next !== key) {
      payload = build(seedDir);
      key = next;
    }
    return payload;
  };
}

/**
 * One detail patch: DEM heights averaged to DETAIL_ARC_SEC from the cached
 * GLO-90 tiles, and the nearest cached WorldCover overview pixel, both masked
 * to Indonesia. Cells without a DEM tile are sea (0 m).
 */
export function buildDetail(
  seedDir: string,
  west: number,
  north: number,
  outlines: Outlines = readOutlines(),
  bufferKm = 10,
): Uint8Array {
  const grid = detailGrid(west, north);
  const size = grid.width;
  const mask = indonesiaMask(outlines, grid, bufferKm);
  const heights = new Int16Array(size * size).fill(DETAIL_NODATA);
  const classes = new Uint8Array(size * size);
  const files = demFiles(seedDir);
  const seed = files ? (JSON.parse(readFileSync(files.json, "utf8")) as DemSeed) : null;
  const perTile = DETAIL_SIZE / DETAIL_DEGREES;
  for (let dy = 0; dy < DETAIL_DEGREES; dy++) {
    for (let dx = 0; dx < DETAIL_DEGREES; dx++) {
      const name = tileName(GLO90, north - dy - 1, west + dx);
      const path = seed ? join(seedDir, "dem/cache", seed.source.id, `${name}.tif`) : "";
      let means: Float32Array | null = null;
      if (seed && existsSync(path)) {
        const raster = readGeoTiff(readFileSync(path));
        means = blockMeans(
          raster.values,
          GLO90.samplesPerDegree,
          GLO90.samplesPerDegree / perTile,
          raster.nodata,
        );
      }
      for (let r = 0; r < perTile; r++) {
        for (let c = 0; c < perTile; c++) {
          const index = (dy * perTile + r) * size + dx * perTile + c;
          if (!mask[index]) continue;
          const mean = means ? means[r * perTile + c] : 0;
          heights[index] = Number.isNaN(mean) ? DETAIL_NODATA : Math.round(mean);
        }
      }
    }
  }
  const rasters = new Map<string, Uint8Array | null>();
  const step = WORLDCOVER.tileDegrees;
  const pixels = WORLDCOVER.overviewWidth / step;
  for (let row = 0; row < size; row++) {
    const latitude = north - (row + 0.5) * grid.cell;
    const south = Math.floor(latitude / step) * step;
    for (let col = 0; col < size; col++) {
      const index = row * size + col;
      if (!mask[index]) continue;
      const longitude = west + (col + 0.5) * grid.cell;
      const tileWest = Math.floor(longitude / step) * step;
      const name = worldcoverName(south, tileWest);
      if (!rasters.has(name)) {
        const path = landcoverCacheFile(seedDir, WORLDCOVER, name);
        rasters.set(name, existsSync(path) ? new Uint8Array(readFileSync(path)) : null);
      }
      const raster = rasters.get(name);
      if (!raster) continue;
      const x = Math.min(WORLDCOVER.overviewWidth - 1, Math.floor((longitude - tileWest) * pixels));
      const y = Math.min(
        WORLDCOVER.overviewWidth - 1,
        Math.floor((south + step - latitude) * pixels),
      );
      classes[index] = raster[y * WORLDCOVER.overviewWidth + x];
    }
  }
  const result = new Uint8Array(size * size * 3);
  result.set(new Uint8Array(heights.buffer), 0);
  result.set(classes, size * size * 2);
  return result;
}

/** Keep the last few detail patches in memory. */
export function detailCache(seedDir: string, build = buildDetail, limit = 12) {
  const patches = new Map<string, Uint8Array>();
  return (west: number, north: number) => {
    const key = `${west},${north}`;
    let patch = patches.get(key);
    if (patch) patches.delete(key);
    else patch = build(seedDir, west, north);
    patches.set(key, patch);
    while (patches.size > limit) patches.delete(patches.keys().next().value as string);
    return patch;
  };
}

export interface PreviewResponse {
  status: number;
  type: string;
  body: Uint8Array | string;
}

const text = (status: number, body: string): PreviewResponse => ({
  status,
  type: "text/plain; charset=utf-8",
  body,
});

/** Response for one path below PREVIEW_BASE. */
export function previewResponse(
  payload: PreviewPayload,
  path: string,
  query = new URLSearchParams(),
  detail?: (west: number, north: number) => Uint8Array,
): PreviewResponse {
  const missing = (what: string) => text(404, `No local ${what} seed. Run pnpm seed:${what}.`);
  const binary = (body: Uint8Array): PreviewResponse => ({
    status: 200,
    type: "application/octet-stream",
    body,
  });
  if (path === "/meta.json") {
    return {
      status: 200,
      type: "application/json; charset=utf-8",
      body: JSON.stringify(payload.meta),
    };
  }
  if (path === "/dem.i16") return payload.dem ? binary(payload.dem) : missing("dem");
  if (path === "/firms.bin") return payload.firms ? binary(payload.firms) : missing("firms");
  if (path === "/landcover.u8")
    return payload.landcover ? binary(payload.landcover) : missing("landcover");
  if (path === "/features.json") {
    return payload.features
      ? { status: 200, type: "application/json; charset=utf-8", body: payload.features }
      : missing("features");
  }
  if (path === "/detail.bin") {
    const dem = payload.meta.dem;
    if (!dem || !payload.meta.detail || !detail) return missing("dem");
    const west = Number(query.get("west"));
    const north = Number(query.get("north"));
    const inside =
      Number.isInteger(west) &&
      Number.isInteger(north) &&
      west >= Math.floor(dem.west) &&
      west + DETAIL_DEGREES <= Math.ceil(dem.west + dem.width * dem.cell) &&
      north <= Math.ceil(dem.north) &&
      north - DETAIL_DEGREES >= Math.floor(dem.north - dem.height * dem.cell);
    return inside
      ? binary(detail(west, north))
      : text(400, "The patch must use whole degrees inside the grid.");
  }
  return text(404, "Not found");
}

/** Vite plugin: serve the preview payloads in the development server only. */
export function localSeedPreview(
  seedDir = fileURLToPath(new URL("../../.data/seed", import.meta.url)),
): Plugin {
  return {
    name: "kawal:local-seed-preview",
    apply: "serve",
    enforce: "pre",
    configureServer(server) {
      const payload = previewCache(seedDir);
      const detail = detailCache(seedDir);
      server.middlewares.use(PREVIEW_BASE, (request: IncomingMessage, response: ServerResponse) => {
        let result: PreviewResponse;
        try {
          const url = new URL(request.url ?? "/", "http://localhost");
          result =
            request.method === "GET" || request.method === "HEAD"
              ? previewResponse(payload(), url.pathname, url.searchParams, detail)
              : text(405, "Method not allowed");
        } catch (error) {
          result = text(500, `Local seed preview failed: ${String(error)}`);
        }
        response.statusCode = result.status;
        response.setHeader("Content-Type", result.type);
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Robots-Tag", "noindex");
        response.end(request.method === "HEAD" ? undefined : result.body);
      });
    },
  };
}
