// Local seed preview for /rancangan/d/indonesia (ADR 0009, local seed preview).
// The development server builds these payloads from .data/seed. The static
// build has no seed data, so the page then shows that the data is unavailable.
// A satellite detection is not a confirmed fire.

export const PREVIEW_BASE = "/__seed/indonesia";
export const RECORD_BYTES = 16;
export const SEED_CONFIDENCES = ["rendah", "nominal", "tinggi"] as const;
export const SEED_SATELLITES = ["NOAA-20", "NOAA-21"] as const;
/** Island groups in alphabetical order, then the remainder. Not a ranking. */
export const GROUPS = ["Jawa", "Kalimantan", "Papua", "Sulawesi", "Sumatra", "Pulau lain"] as const;
export const WINDOW_CHOICES = [24, 48, 72, 168] as const;

export type SeedConfidence = (typeof SEED_CONFIDENCES)[number];
export type SeedSatellite = (typeof SEED_SATELLITES)[number];

export interface FirmsPreviewMeta {
  createdAt: string;
  windowEnd: string;
  windowHours: number;
  /** Detection times are stored as whole minutes after this UTC minute. */
  epochMinute: number;
  count: number;
  earliestObservationAt: string | null;
  latestObservationAt: string | null;
  attribution: string;
  notice: string;
  boundary: string;
  bufferKm: number;
  rows: {
    total: number;
    accepted: number;
    outsideIndonesia: number;
    outsideWindow: number;
    invalid: number;
  };
  sources: {
    sourceId: string;
    url: string;
    retrievedAt: string;
    lastModified: string | null;
    sha256: string;
  }[];
}

export interface DemPreviewMeta {
  createdAt: string;
  product: string;
  surface: string;
  horizontal: string;
  vertical: string;
  licenceNotice: string;
  notice: string;
  /** North-up grid. Cell (0, 0) is the north-west cell. */
  west: number;
  north: number;
  cell: number;
  cellArcSec: number;
  width: number;
  height: number;
  nodata: number;
  minimum: number | null;
  maximum: number | null;
  tiles: number;
}

export interface LandcoverPreviewMeta {
  createdAt: string;
  product: string;
  notice: string;
  licenceNotice: string;
  tiles: number;
}

export interface FeaturesPreviewMeta {
  createdAt: string;
  attribution: string;
  notice: string;
  rivers: number;
  lakes: number;
  places: number;
}

export interface PreviewMeta {
  schemaVersion: 1;
  firms: FirmsPreviewMeta | null;
  dem: DemPreviewMeta | null;
  /** Same grid as `dem`. */
  landcover: LandcoverPreviewMeta | null;
  features: FeaturesPreviewMeta | null;
  /** True when the development server can make detail patches. */
  detail: boolean;
}

export interface PreviewPlace {
  name: string;
  rank: number;
  population: number;
  capital: "negara" | "provinsi" | null;
  longitude: number;
  latitude: number;
}

/** Natural Earth 1:10m features. Points are flat [longitude, latitude, ...] lists. */
export interface PreviewFeatures {
  rivers: { name: string; rank: number; points: number[] }[];
  lakes: { name: string; rank: number; rings: number[][] }[];
  places: PreviewPlace[];
}

/** A north-up raster grid. Cell (0, 0) is the north-west cell. */
export interface RasterGrid {
  west: number;
  north: number;
  cell: number;
  width: number;
  height: number;
  nodata: number;
}

// A detail patch covers DETAIL_DEGREES x DETAIL_DEGREES at DETAIL_ARC_SEC. Its
// file holds Int16 heights, then UInt8 land cover classes, both row by row.
export const DETAIL_DEGREES = 2;
export const DETAIL_ARC_SEC = 6;
export const DETAIL_SIZE = (DETAIL_DEGREES * 3600) / DETAIL_ARC_SEC;
export const DETAIL_NODATA = -32768;

export function detailGrid(west: number, north: number): RasterGrid {
  return {
    west,
    north,
    cell: DETAIL_ARC_SEC / 3600,
    width: DETAIL_SIZE,
    height: DETAIL_SIZE,
    nodata: DETAIL_NODATA,
  };
}

export function decodeDetail(buffer: ArrayBuffer) {
  const cells = DETAIL_SIZE * DETAIL_SIZE;
  if (buffer.byteLength !== cells * 3) throw new Error("The detail patch has the wrong size");
  return {
    heights: new Int16Array(buffer, 0, cells),
    landcover: new Uint8Array(buffer, cells * 2, cells),
  };
}

/** ESA WorldCover classes, with labels and map colours. */
export const LANDCOVER_CLASSES: {
  value: number;
  label: string;
  colour: [number, number, number];
}[] = [
  { value: 10, label: "Pohon (termasuk kebun sawit dan hutan tanaman)", colour: [62, 104, 62] },
  { value: 95, label: "Mangrove", colour: [44, 120, 98] },
  { value: 20, label: "Semak", colour: [160, 160, 96] },
  { value: 30, label: "Padang rumput", colour: [202, 196, 126] },
  { value: 40, label: "Lahan pertanian", colour: [214, 190, 132] },
  { value: 90, label: "Lahan basah berumput", colour: [104, 150, 134] },
  { value: 50, label: "Terbangun", colour: [150, 138, 130] },
  { value: 60, label: "Lahan terbuka", colour: [214, 206, 190] },
  { value: 80, label: "Air", colour: [185, 205, 210] },
  { value: 70, label: "Salju dan es", colour: [244, 242, 238] },
  { value: 100, label: "Lumut dan lumut kerak", colour: [200, 196, 160] },
];

export interface DetectionInput {
  longitude: number;
  latitude: number;
  frp: number;
  acquiredAt: string;
  confidence: SeedConfidence;
  satellite: SeedSatellite;
  daynight: "D" | "N";
  group: number;
}

/** Column arrays, in the seed order: newest first. */
export interface Detections {
  count: number;
  longitude: Float32Array;
  latitude: Float32Array;
  frp: Float32Array;
  time: Float64Array;
  confidence: Uint8Array;
  satellite: Uint8Array;
  night: Uint8Array;
  group: Uint8Array;
}

// Record layout, little-endian: longitude f32, latitude f32, FRP f32,
// minutes after epochMinute u16, confidence u8, flags u8 (bit 0 NOAA-21,
// bit 1 night, bits 2-5 group).
export function encodeDetections(list: readonly DetectionInput[], epochMinute: number): Uint8Array {
  const bytes = new Uint8Array(list.length * RECORD_BYTES);
  const view = new DataView(bytes.buffer);
  list.forEach((item, i) => {
    const minutes = Date.parse(item.acquiredAt) / 60_000 - epochMinute;
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 0xffff) {
      throw new Error(`Detection time ${item.acquiredAt} is outside the preview range`);
    }
    if (!Number.isInteger(item.group) || item.group < 0 || item.group >= GROUPS.length) {
      throw new Error(`Unknown island group ${item.group}`);
    }
    const at = i * RECORD_BYTES;
    view.setFloat32(at, item.longitude, true);
    view.setFloat32(at + 4, item.latitude, true);
    view.setFloat32(at + 8, item.frp, true);
    view.setUint16(at + 12, minutes, true);
    view.setUint8(at + 14, SEED_CONFIDENCES.indexOf(item.confidence));
    view.setUint8(
      at + 15,
      (item.satellite === "NOAA-21" ? 1 : 0) | (item.daynight === "N" ? 2 : 0) | (item.group << 2),
    );
  });
  return bytes;
}

export function decodeDetections(buffer: ArrayBuffer, epochMinute: number): Detections {
  if (buffer.byteLength % RECORD_BYTES !== 0)
    throw new Error("The detection file has a partial record");
  const count = buffer.byteLength / RECORD_BYTES;
  const view = new DataView(buffer);
  const result: Detections = {
    count,
    longitude: new Float32Array(count),
    latitude: new Float32Array(count),
    frp: new Float32Array(count),
    time: new Float64Array(count),
    confidence: new Uint8Array(count),
    satellite: new Uint8Array(count),
    night: new Uint8Array(count),
    group: new Uint8Array(count),
  };
  for (let i = 0; i < count; i++) {
    const at = i * RECORD_BYTES;
    const flags = view.getUint8(at + 15);
    result.longitude[i] = view.getFloat32(at, true);
    result.latitude[i] = view.getFloat32(at + 4, true);
    result.frp[i] = view.getFloat32(at + 8, true);
    result.time[i] = (epochMinute + view.getUint16(at + 12, true)) * 60_000;
    result.confidence[i] = Math.min(2, view.getUint8(at + 14));
    result.satellite[i] = flags & 1;
    result.night[i] = (flags >> 1) & 1;
    result.group[i] = Math.min(GROUPS.length - 1, flags >> 2);
  }
  return result;
}

export interface DetectionFilter {
  hours: number;
  confidences: readonly SeedConfidence[];
  satellites: readonly SeedSatellite[];
}

/** Indices of the detections in (end − hours, end] that pass the filter, newest first. */
export function selectDetections(
  detections: Detections,
  end: number,
  filter: DetectionFilter,
): Uint32Array {
  const start = end - filter.hours * 3_600_000;
  const confidence = SEED_CONFIDENCES.map((value) => filter.confidences.includes(value));
  const satellite = SEED_SATELLITES.map((value) => filter.satellites.includes(value));
  const result = new Uint32Array(detections.count);
  let n = 0;
  for (let i = 0; i < detections.count; i++) {
    const time = detections.time[i];
    if (
      time > start &&
      time <= end &&
      confidence[detections.confidence[i]] &&
      satellite[detections.satellite[i]]
    ) {
      result[n++] = i;
    }
  }
  return result.slice(0, n);
}

const WIB_OFFSET = 7 * 3_600_000;
export const wibDayKey = (time: number) => new Date(time + WIB_OFFSET).toISOString().slice(0, 10);

export interface CountRow {
  key: string;
  /** Counts by confidence: rendah, nominal, tinggi. */
  counts: [number, number, number];
  total: number;
}

function addRow(rows: Map<string, CountRow>, key: string, confidence: number) {
  let row = rows.get(key);
  if (!row) {
    row = { key, counts: [0, 0, 0], total: 0 };
    rows.set(key, row);
  }
  row.counts[confidence]++;
  row.total++;
}

/** Counts per WIB calendar day, oldest day first. Days without detections are included. */
export function dailyCounts(
  detections: Detections,
  indices: Uint32Array,
  end: number,
  hours: number,
): CountRow[] {
  const rows = new Map<string, CountRow>();
  const first = wibDayKey(end - hours * 3_600_000 + 1);
  for (let day = Date.parse(`${first}T00:00:00Z`); ; day += 86_400_000) {
    const key = new Date(day).toISOString().slice(0, 10);
    rows.set(key, { key, counts: [0, 0, 0], total: 0 });
    if (key >= wibDayKey(end)) break;
  }
  for (const i of indices) addRow(rows, wibDayKey(detections.time[i]), detections.confidence[i]);
  return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Counts per island group, in the fixed GROUPS order, including empty groups. */
export function groupCounts(detections: Detections, indices: Uint32Array): CountRow[] {
  const rows = new Map<string, CountRow>(
    GROUPS.map((key) => [key, { key, counts: [0, 0, 0], total: 0 }]),
  );
  for (const i of indices) addRow(rows, GROUPS[detections.group[i]], detections.confidence[i]);
  return GROUPS.map((key) => rows.get(key) as CountRow);
}

/** Bilinear height in metres at a position, or null outside the grid or in nodata. */
export function heightAt(
  meta: RasterGrid,
  heights: Int16Array,
  longitude: number,
  latitude: number,
) {
  const x = (longitude - meta.west) / meta.cell - 0.5;
  const y = (meta.north - latitude) / meta.cell - 0.5;
  if (x < -0.5 || y < -0.5 || x > meta.width - 0.5 || y > meta.height - 0.5) return null;
  const x0 = Math.max(0, Math.min(meta.width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(meta.height - 1, Math.floor(y)));
  const x1 = Math.min(meta.width - 1, x0 + 1);
  const y1 = Math.min(meta.height - 1, y0 + 1);
  const tx = Math.max(0, Math.min(1, x - x0));
  const ty = Math.max(0, Math.min(1, y - y0));
  let sum = 0;
  let weight = 0;
  for (const [cx, cy, w] of [
    [x0, y0, (1 - tx) * (1 - ty)],
    [x1, y0, tx * (1 - ty)],
    [x0, y1, (1 - tx) * ty],
    [x1, y1, tx * ty],
  ] as const) {
    const value = heights[cy * meta.width + cx];
    if (value === meta.nodata || w === 0) continue;
    sum += value * w;
    weight += w;
  }
  return weight > 0 ? sum / weight : null;
}
