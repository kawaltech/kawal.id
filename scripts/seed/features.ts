// Local seed of Natural Earth 1:10m rivers, lakes, and populated places in
// Indonesia (public domain). The scale suits a national map. At a district
// zoom, a line can be some kilometres from the real river. For local
// inspection only.
import { join } from "node:path";
import { type Outlines, inIndonesia, readOutlines } from "./boundary.ts";
import { type Fetch, download, writeFileAtomic } from "./files.ts";

export const NATURAL_EARTH_VERSION = "v5.1.2";
const BASE = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NATURAL_EARTH_VERSION}/geojson`;
export const NATURAL_EARTH_FILES = {
  rivers: `${BASE}/ne_10m_rivers_lake_centerlines.geojson`,
  lakes: `${BASE}/ne_10m_lakes.geojson`,
  places: `${BASE}/ne_10m_populated_places_simple.geojson`,
} as const;

type Position = number[];
interface Feature {
  properties?: Record<string, unknown> | null;
  geometry?: { type: string; coordinates: unknown } | null;
}

export interface SeedLine {
  name: string;
  rank: number;
  points: number[];
}
export interface SeedPolygon {
  name: string;
  rank: number;
  rings: number[][];
}
export interface SeedPlace {
  name: string;
  rank: number;
  population: number;
  capital: "negara" | "provinsi" | null;
  longitude: number;
  latitude: number;
}

export interface FeaturesSeed {
  kind: "kawal-local-seed/features";
  schemaVersion: 1;
  synthetic: false;
  notice: string;
  attribution: string;
  createdAt: string;
  sources: { url: string; sha256: string; bytes: number; retrievedAt: string }[];
  boundary: Outlines["source"] & { bufferKm: number };
  rivers: SeedLine[];
  lakes: SeedPolygon[];
  places: SeedPlace[];
}

const round = (value: number) => Math.round(value * 10_000) / 10_000;
const text = (value: unknown) => (typeof value === "string" ? value : "");
const rank = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 10);

function features(body: Buffer, url: string): Feature[] {
  const data = JSON.parse(body.toString("utf8")) as { type?: string; features?: Feature[] };
  if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
    throw new Error(`${url} is not a GeoJSON FeatureCollection`);
  }
  return data.features;
}

function lines(geometry: Feature["geometry"]): Position[][] {
  if (geometry?.type === "LineString") return [geometry.coordinates as Position[]];
  if (geometry?.type === "MultiLineString") return geometry.coordinates as Position[][];
  return [];
}

function polygons(geometry: Feature["geometry"]): Position[][][] {
  if (geometry?.type === "Polygon") return [geometry.coordinates as Position[][]];
  if (geometry?.type === "MultiPolygon") return geometry.coordinates as Position[][][];
  return [];
}

const flat = (positions: Position[]) =>
  positions.flatMap(([longitude, latitude]) => [round(longitude), round(latitude)]);

/** Keep the features with at least one vertex in Indonesia or its coastal buffer. */
export function selectFeatures(
  input: { rivers: Feature[]; lakes: Feature[]; places: Feature[] },
  outlines: Outlines,
  bufferKm: number,
) {
  const touches = (positions: Position[]) =>
    positions.some(([longitude, latitude]) => inIndonesia(outlines, longitude, latitude, bufferKm));
  const rivers: SeedLine[] = [];
  for (const feature of input.rivers) {
    for (const line of lines(feature.geometry)) {
      if (line.length >= 2 && touches(line)) {
        rivers.push({
          name: text(feature.properties?.name),
          rank: rank(feature.properties?.scalerank),
          points: flat(line),
        });
      }
    }
  }
  const lakes: SeedPolygon[] = [];
  for (const feature of input.lakes) {
    for (const polygon of polygons(feature.geometry)) {
      if (polygon[0]?.length >= 3 && touches(polygon[0])) {
        lakes.push({
          name: text(feature.properties?.name),
          rank: rank(feature.properties?.scalerank),
          rings: polygon.map(flat),
        });
      }
    }
  }
  const places: SeedPlace[] = [];
  for (const feature of input.places) {
    const p = feature.properties ?? {};
    const longitude = Number(p.longitude);
    const latitude = Number(p.latitude);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
    if (!inIndonesia(outlines, longitude, latitude, bufferKm)) continue;
    places.push({
      name: text(p.name),
      rank: rank(p.scalerank),
      population: typeof p.pop_max === "number" ? p.pop_max : 0,
      capital:
        p.adm0cap === 1
          ? "negara"
          : text(p.featurecla).startsWith("Admin-1 capital")
            ? "provinsi"
            : null,
      longitude: round(longitude),
      latitude: round(latitude),
    });
  }
  places.sort(
    (a, b) => a.rank - b.rank || b.population - a.population || a.name.localeCompare(b.name),
  );
  return { rivers, lakes, places };
}

export const FEATURES_SEED_FILE = "features/indonesia-ne10m.json";

export async function runFeaturesSeed(options: {
  outDir: string;
  fetch?: Fetch;
  now?: () => Date;
  outlines?: Outlines;
  bufferKm?: number;
}): Promise<FeaturesSeed> {
  const { outDir, fetch = globalThis.fetch, now = () => new Date(), bufferKm = 10 } = options;
  const outlines = options.outlines ?? readOutlines();
  const files = {
    rivers: await download(fetch, NATURAL_EARTH_FILES.rivers, { now }),
    lakes: await download(fetch, NATURAL_EARTH_FILES.lakes, { now }),
    places: await download(fetch, NATURAL_EARTH_FILES.places, { now }),
  };
  const selected = selectFeatures(
    {
      rivers: features(files.rivers.body, files.rivers.url),
      lakes: features(files.lakes.body, files.lakes.url),
      places: features(files.places.body, files.places.url),
    },
    outlines,
    bufferKm,
  );
  const seed: FeaturesSeed = {
    kind: "kawal-local-seed/features",
    schemaVersion: 1,
    synthetic: false,
    notice:
      "Local seed only. Natural Earth 1:10m lines are generalized for national maps. Do not commit, publish, or use this file in tests or builds.",
    attribution: `Made with Natural Earth (public domain), ${NATURAL_EARTH_VERSION}.`,
    createdAt: now().toISOString(),
    sources: Object.values(files).map(({ url, sha256, bytes, retrievedAt }) => ({
      url,
      sha256,
      bytes,
      retrievedAt,
    })),
    boundary: { ...outlines.source, bufferKm },
    ...selected,
  };
  writeFileAtomic(join(outDir, FEATURES_SEED_FILE), `${JSON.stringify(seed)}\n`);
  return seed;
}
