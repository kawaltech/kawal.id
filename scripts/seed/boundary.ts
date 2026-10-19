// Indonesia outline for the local seed filters. It reuses the Natural Earth
// 1:50m Admin 0 paths in app/design/map-geometry.ts (public domain). The outline
// is simplified: one edge can be about 25 km long. Coastal points therefore need
// a buffer, and a point near a border can be assigned to the wrong country.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface Ring {
  /** Flat [longitude, latitude, ...] vertex list. The ring is closed implicitly. */
  points: Float64Array;
  west: number;
  east: number;
  south: number;
  north: number;
}

export interface Outlines {
  indonesia: Ring[];
  neighbours: Ring[];
  source: { name: string; file: string; sha256: string };
}

/** A north-up grid of square cells in degrees. Cell (0, 0) is the north-west cell. */
export interface Grid {
  west: number;
  north: number;
  cell: number;
  width: number;
  height: number;
}

const KM_PER_DEGREE_LAT = 110.574;
const KM_PER_DEGREE_LON = 111.32;
const MAP_GEOMETRY = fileURLToPath(new URL("../../app/design/map-geometry.ts", import.meta.url));

function ring(values: number[]): Ring {
  const points = Float64Array.from(values);
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    west = Math.min(west, points[i]);
    east = Math.max(east, points[i]);
    south = Math.min(south, points[i + 1]);
    north = Math.max(north, points[i + 1]);
  }
  return { points, west, east, south, north };
}

/** Rings from flat [longitude, latitude, ...] lists. */
export function rings(lists: number[][]): Ring[] {
  return lists.map(ring);
}

/** Convert an SVG path with M, L, and Z commands from map units to longitude and latitude. */
export function parsePath(
  path: string,
  scale: number,
  origin: { longitude: number; latitude: number },
): Ring[] {
  const lists: number[][] = [];
  let current: number[] | null = null;
  for (const [, command, args] of path.matchAll(/([A-Za-z])([^A-Za-z]*)/g)) {
    if (command === "Z") {
      if (current && current.length >= 6) lists.push(current);
      current = null;
      continue;
    }
    if (command !== "M" && command !== "L") throw new Error(`Unsupported path command ${command}`);
    const numbers = args
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    if (numbers.length % 2 !== 0 || numbers.some((value) => !Number.isFinite(value))) {
      throw new Error(`Invalid path coordinates after ${command}`);
    }
    if (command === "M") {
      if (current && current.length >= 6) lists.push(current);
      current = [];
    }
    if (!current) throw new Error("A path line must follow a move");
    for (let i = 0; i < numbers.length; i += 2) {
      current.push(numbers[i] / scale + origin.longitude, origin.latitude - numbers[i + 1] / scale);
    }
  }
  if (current && current.length >= 6) lists.push(current);
  return rings(lists);
}

/** Read the Indonesia and neighbour outlines from the shared design geometry. */
export function readOutlines(file = MAP_GEOMETRY): Outlines {
  const text = readFileSync(file, "utf8");
  const scale = Number(/export const MAP_SCALE = ([\d.]+);/.exec(text)?.[1]);
  const origin = /export const MAP_ORIGIN = \{ longitude: (-?[\d.]+), latitude: (-?[\d.]+) \}/.exec(
    text,
  );
  const indonesia = /export const INDONESIA_PATH = "([^"]+)";/.exec(text)?.[1];
  const neighbours = /export const NEIGHBOUR_PATH = "([^"]+)";/.exec(text)?.[1];
  if (!Number.isFinite(scale) || !origin || !indonesia || !neighbours) {
    throw new Error(`Cannot read the map outlines in ${file}`);
  }
  const position = { longitude: Number(origin[1]), latitude: Number(origin[2]) };
  return {
    indonesia: parsePath(indonesia, scale, position),
    neighbours: parsePath(neighbours, scale, position),
    source: {
      name: "Natural Earth 1:50m Admin 0, simplified (app/design/map-geometry.ts)",
      file: "app/design/map-geometry.ts",
      sha256: createHash("sha256").update(text).digest("hex"),
    },
  };
}

/** Even-odd point-in-polygon test over all rings. */
export function inside(list: readonly Ring[], longitude: number, latitude: number): boolean {
  let result = false;
  for (const { points, west, east, south, north } of list) {
    if (longitude < west || longitude > east || latitude < south || latitude > north) continue;
    const n = points.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const xi = points[i];
      const yi = points[i + 1];
      const xj = points[j];
      const yj = points[j + 1];
      if (
        yi > latitude !== yj > latitude &&
        longitude < xi + ((latitude - yi) * (xj - xi)) / (yj - yi)
      ) {
        result = !result;
      }
    }
  }
  return result;
}

/** Shortest distance in km from a point to the ring edges, or Infinity beyond `limitKm`. */
export function distanceKm(
  list: readonly Ring[],
  longitude: number,
  latitude: number,
  limitKm: number,
): number {
  const kx = KM_PER_DEGREE_LON * Math.cos((latitude * Math.PI) / 180);
  const ky = KM_PER_DEGREE_LAT;
  const marginX = limitKm / kx;
  const marginY = limitKm / ky;
  let best = Infinity;
  for (const { points, west, east, south, north } of list) {
    if (
      longitude < west - marginX ||
      longitude > east + marginX ||
      latitude < south - marginY ||
      latitude > north + marginY
    ) {
      continue;
    }
    const n = points.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const ax = (points[j] - longitude) * kx;
      const ay = (points[j + 1] - latitude) * ky;
      const dx = (points[i] - points[j]) * kx;
      const dy = (points[i + 1] - points[j + 1]) * ky;
      const length = dx * dx + dy * dy;
      const t = length === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length));
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best <= limitKm ? best : Infinity;
}

/**
 * A point outside both outlines belongs to Indonesia when it is inside the
 * buffer and nearer to the Indonesia outline than to a neighbour outline.
 */
export function nearIndonesia(
  outlines: Outlines,
  longitude: number,
  latitude: number,
  bufferKm: number,
): boolean {
  const indonesia = distanceKm(outlines.indonesia, longitude, latitude, bufferKm);
  if (indonesia === Infinity) return false;
  return indonesia <= distanceKm(outlines.neighbours, longitude, latitude, indonesia);
}

/** True for a point inside the Indonesia outline or its coastal buffer. */
export function inIndonesia(
  outlines: Outlines,
  longitude: number,
  latitude: number,
  bufferKm: number,
): boolean {
  if (inside(outlines.indonesia, longitude, latitude)) return true;
  if (inside(outlines.neighbours, longitude, latitude)) return false;
  return nearIndonesia(outlines, longitude, latitude, bufferKm);
}

/** Mark the cells whose centres are inside the rings, with the same rule as `inside`. */
export function rasterize(list: readonly Ring[], grid: Grid): Uint8Array {
  const mask = new Uint8Array(grid.width * grid.height);
  const crossings: number[] = [];
  for (let row = 0; row < grid.height; row++) {
    const latitude = grid.north - (row + 0.5) * grid.cell;
    crossings.length = 0;
    for (const { points, south, north } of list) {
      if (latitude < south || latitude > north) continue;
      const n = points.length;
      for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
        const yi = points[i + 1];
        const yj = points[j + 1];
        if (yi > latitude !== yj > latitude) {
          crossings.push(points[i] + ((latitude - yi) * (points[j] - points[i])) / (yj - yi));
        }
      }
    }
    crossings.sort((a, b) => a - b);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      // A centre is inside when crossings[k] <= longitude < crossings[k + 1].
      const first = Math.max(0, Math.ceil((crossings[k] - grid.west) / grid.cell - 0.5));
      const last = Math.min(
        grid.width - 1,
        Math.ceil((crossings[k + 1] - grid.west) / grid.cell - 0.5) - 1,
      );
      // A span wholly outside the grid is empty. A negative end makes `fill`
      // count from the end of the array, so skip it.
      if (first > last) continue;
      mask.fill(1, row * grid.width + first, row * grid.width + last + 1);
    }
  }
  return mask;
}

/** Box dilation: a cell is set when a set cell is within `rx` columns and `ry` rows. */
export function dilate(mask: Uint8Array, width: number, height: number, rx: number, ry: number) {
  const horizontal = new Uint8Array(mask.length);
  const sums = new Int32Array(Math.max(width, height) + 1);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) sums[col + 1] = sums[col] + mask[row * width + col];
    for (let col = 0; col < width; col++) {
      const from = Math.max(0, col - rx);
      const to = Math.min(width, col + rx + 1);
      horizontal[row * width + col] = sums[to] - sums[from] > 0 ? 1 : 0;
    }
  }
  const result = new Uint8Array(mask.length);
  for (let col = 0; col < width; col++) {
    for (let row = 0; row < height; row++)
      sums[row + 1] = sums[row] + horizontal[row * width + col];
    for (let row = 0; row < height; row++) {
      const from = Math.max(0, row - ry);
      const to = Math.min(height, row + ry + 1);
      result[row * width + col] = sums[to] - sums[from] > 0 ? 1 : 0;
    }
  }
  return result;
}

/**
 * Mark the cells that the ring edges cross. An edge point outside the grid but
 * within `rx` columns and `ry` rows marks the nearest grid cell, so a later
 * dilation by the same amount still reaches every cell within that range.
 */
export function traceEdges(list: readonly Ring[], grid: Grid, rx = 0, ry = 0): Uint8Array {
  const mask = new Uint8Array(grid.width * grid.height);
  const east = grid.west + grid.width * grid.cell;
  const south = grid.north - grid.height * grid.cell;
  const marginX = rx * grid.cell;
  const marginY = ry * grid.cell;
  const mark = (longitude: number, latitude: number) => {
    const x = Math.floor((longitude - grid.west) / grid.cell);
    const y = Math.floor((grid.north - latitude) / grid.cell);
    if (x < -rx || x >= grid.width + rx || y < -ry || y >= grid.height + ry) return;
    const col = Math.max(0, Math.min(grid.width - 1, x));
    const row = Math.max(0, Math.min(grid.height - 1, y));
    mask[row * grid.width + col] = 1;
  };
  for (const ring of list) {
    if (
      ring.east < grid.west - marginX ||
      ring.west > east + marginX ||
      ring.north < south - marginY ||
      ring.south > grid.north + marginY
    ) {
      continue;
    }
    const { points } = ring;
    const n = points.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const ax = points[j];
      const ay = points[j + 1];
      const bx = points[i];
      const by = points[i + 1];
      if (
        Math.max(ax, bx) < grid.west - marginX ||
        Math.min(ax, bx) > east + marginX ||
        Math.max(ay, by) < south - marginY ||
        Math.min(ay, by) > grid.north + marginY
      ) {
        continue;
      }
      // Half-cell steps visit every cell that the edge crosses, or a neighbour
      // of it, which the dilation margin of one cell covers.
      const steps = Math.max(
        1,
        Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) / (grid.cell / 2)),
      );
      for (let s = 0; s <= steps; s++)
        mark(ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps);
    }
  }
  return mask;
}

/** Cells whose centres pass `inIndonesia`. */
export function indonesiaMask(outlines: Outlines, grid: Grid, bufferKm: number): Uint8Array {
  const indonesia = rasterize(outlines.indonesia, grid);
  const neighbours = rasterize(outlines.neighbours, grid);
  const south = grid.north - grid.height * grid.cell;
  const widest = Math.cos((Math.max(Math.abs(south), Math.abs(grid.north)) * Math.PI) / 180);
  const rx = Math.ceil(bufferKm / (grid.cell * KM_PER_DEGREE_LON * widest)) + 1;
  const ry = Math.ceil(bufferKm / (grid.cell * KM_PER_DEGREE_LAT)) + 1;
  // Buffer candidates come from the land cells and from the outline edges. A
  // small island or a narrow part of a ring can contain no cell centre.
  const seeds = traceEdges(outlines.indonesia, grid, rx, ry);
  for (let i = 0; i < seeds.length; i++) seeds[i] |= indonesia[i];
  const near = dilate(seeds, grid.width, grid.height, rx, ry);
  const mask = new Uint8Array(indonesia.length);
  for (let row = 0; row < grid.height; row++) {
    const latitude = grid.north - (row + 0.5) * grid.cell;
    for (let col = 0; col < grid.width; col++) {
      const index = row * grid.width + col;
      if (indonesia[index]) mask[index] = 1;
      else if (near[index] && !neighbours[index]) {
        const longitude = grid.west + (col + 0.5) * grid.cell;
        mask[index] = nearIndonesia(outlines, longitude, latitude, bufferKm) ? 1 : 0;
      }
    }
  }
  return mask;
}

/** Whole-degree bounds around the Indonesia outline and its buffer. */
export function indonesiaBounds(outlines: Outlines, bufferKm: number) {
  const margin = bufferKm / (KM_PER_DEGREE_LAT * Math.cos((12 * Math.PI) / 180));
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const item of outlines.indonesia) {
    west = Math.min(west, item.west);
    east = Math.max(east, item.east);
    south = Math.min(south, item.south);
    north = Math.max(north, item.north);
  }
  return {
    west: Math.floor(west - margin),
    east: Math.ceil(east + margin),
    south: Math.floor(south - margin),
    north: Math.ceil(north + margin),
  };
}
