// Synthetic incident for the 3D design review (ADR 0009). The place, terrain, fire,
// model run, weather, suppression, and satellite records are invented. Nothing here
// describes a real event or location. The spread "model" is a drawing aid, not a
// fire-behaviour model, and it must never feed public data.

export interface Point {
  x: number;
  y: number;
}

/** Local map frame in kilometres: x runs west to east, y runs south to north. */
export const WORLD_WIDTH = 16;
export const WORLD_DEPTH = 12;

const HOUR = 3_600_000;
export const IGNITION_AT = Date.parse("2026-09-08T07:26:00Z"); // 14.26 WIB
export const TIMELINE_START = Date.parse("2026-09-08T07:00:00Z"); // 14.00 WIB
export const TIMELINE_END = Date.parse("2026-09-11T05:00:00Z"); // 12.00 WIB
export const CONTAINED_AT = Date.parse("2026-09-11T04:20:00Z"); // 11.20 WIB
export const INITIAL_TIME = Date.parse("2026-09-09T09:00:00Z"); // 16.00 WIB
const CONTAINED_HOURS = (CONTAINED_AT - IGNITION_AT) / HOUR;

// Noise ----------------------------------------------------------------------

function hash(ix: number, iy: number, seed: number) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Fractal value noise from 0 to 1. */
export function fbm(x: number, y: number, octaves: number, seed: number) {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let norm = 0;
  for (let octave = 0; octave < octaves; octave++) {
    sum += amplitude * valueNoise(x * frequency, y * frequency, seed + octave);
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return sum / norm;
}

function ridged(x: number, y: number, octaves: number, seed: number) {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let norm = 0;
  for (let octave = 0; octave < octaves; octave++) {
    const n = 1 - Math.abs(2 * valueNoise(x * frequency, y * frequency, seed + octave) - 1);
    sum += amplitude * n * n;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.11;
  }
  return sum / norm;
}

/** Seeded generator for repeatable synthetic records. */
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const gauss = (x: number, y: number, cx: number, cy: number, sigma: number) =>
  Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * sigma * sigma));

// Geometry helpers -------------------------------------------------------------

interface Segment {
  a: Point;
  dx: number;
  dy: number;
  length: number;
  start: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function segments(line: Point[]) {
  const result: Segment[] = [];
  let start = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    result.push({
      a,
      dx: b.x - a.x,
      dy: b.y - a.y,
      length,
      start,
      minX: Math.min(a.x, b.x),
      maxX: Math.max(a.x, b.x),
      minY: Math.min(a.y, b.y),
      maxY: Math.max(a.y, b.y),
    });
    start += length;
  }
  return { list: result, total: start };
}

/** Closest point on a polyline. Segments farther than `limit` are skipped. */
function closestOnPolyline(line: ReturnType<typeof segments>, x: number, y: number, limit = Infinity) {
  let distance = limit;
  let along = 0;
  for (const segment of line.list) {
    if (
      x < segment.minX - distance ||
      x > segment.maxX + distance ||
      y < segment.minY - distance ||
      y > segment.maxY + distance
    )
      continue;
    const t = Math.max(
      0,
      Math.min(1, ((x - segment.a.x) * segment.dx + (y - segment.a.y) * segment.dy) / segment.length ** 2),
    );
    const candidate = Math.hypot(x - (segment.a.x + t * segment.dx), y - (segment.a.y + t * segment.dy));
    if (candidate < distance) {
      distance = candidate;
      along = segment.start + t * segment.length;
    }
  }
  return { distance, fraction: along / line.total };
}

function catmullRom(points: Point[], perSegment: number): Point[] {
  const result: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let step = 0; step < perSegment; step++) {
      const t = step / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const blend = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      result.push({ x: blend(p0.x, p1.x, p2.x, p3.x), y: blend(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

export function polygonAreaKm2(polygon: Point[]) {
  let sum = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++)
    sum += (polygon[j].x + polygon[i].x) * (polygon[j].y - polygon[i].y);
  return Math.abs(sum) / 2;
}

export function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

// Terrain and water ----------------------------------------------------------

export const RIVER: Point[] = catmullRom(
  [
    { x: 7.4, y: 10.45 },
    { x: 6.5, y: 9.7 },
    { x: 5.3, y: 9.0 },
    { x: 4.6, y: 7.6 },
    { x: 3.5, y: 6.6 },
    { x: 2.6, y: 5.3 },
    { x: 2.1, y: 3.9 },
    { x: 1.4, y: 2.6 },
    { x: 0.7, y: 1.3 },
    { x: -0.2, y: 0.5 },
  ],
  10,
);

const RIVER_SEGMENTS = segments(RIVER);

export const LAKE = { x: 8.7, y: 10.75, rx: 1.55, ry: 0.5, angle: (12 * Math.PI) / 180, level: 150 };

const RIDGE = { x: 12.0, y: 9.05, dx: Math.SQRT1_2, dy: -Math.SQRT1_2 };

function lakeDistance(x: number, y: number) {
  const dx = x - LAKE.x;
  const dy = y - LAKE.y;
  const cos = Math.cos(LAKE.angle);
  const sin = Math.sin(LAKE.angle);
  const u = (dx * cos + dy * sin) / LAKE.rx;
  const v = (-dx * sin + dy * cos) / LAKE.ry;
  return u * u + v * v;
}

export function riverHalfWidth(fraction: number) {
  return 0.025 + 0.045 * fraction;
}

/** Ground or water-surface height in metres above sea level. */
export function heightAt(x: number, y: number) {
  const n = fbm(x * 0.32, y * 0.32, 5, 11);
  const r = ridged(x * 0.22 + 3, y * 0.22 - 1, 4, 31);
  const rise = 0.22 + 0.78 * smoothstep(1.5, 12.5, y + 0.25 * x);
  let h = 70 + rise * (360 * r + 170 * n);
  h += 560 * gauss(x, y, 3.3, 9.9, 1.6); // Puncak Utara
  h += 230 * gauss(x, y, 13.1, 8.0, 0.85); // Puncak Timur
  h += 150 * gauss(x, y, 14.1, 2.6, 1.1); // Bukit Selatan
  const across = (x - RIDGE.x) * -RIDGE.dy + (y - RIDGE.y) * RIDGE.dx;
  const along = (x - RIDGE.x) * RIDGE.dx + (y - RIDGE.y) * RIDGE.dy;
  h += 210 * Math.exp(-(across * across) / 0.55) * smoothstep(-4.5, -1.5, along) * smoothstep(4.5, 1.5, along);

  const river = closestOnPolyline(RIVER_SEGMENTS, x, y, 0.95);
  const bed = LAKE.level - 112 * river.fraction;
  if (river.distance < 0.95 && h > bed)
    h = bed + (h - bed) * smoothstep(riverHalfWidth(river.fraction) * 0.6, 0.95, river.distance);

  const q = lakeDistance(x, y);
  if (q < 1) return LAKE.level;
  if (q < 2.4) h = LAKE.level + 4 + Math.max(0, h - LAKE.level - 4) * smoothstep(1, 2.4, q);
  return h;
}

/** Distance to the river centre line in kilometres, or Infinity beyond `limit`. */
export function riverDistance(x: number, y: number, limit: number) {
  return closestOnPolyline(RIVER_SEGMENTS, x, y, limit).distance;
}

export function isWater(x: number, y: number) {
  if (lakeDistance(x, y) < 1) return true;
  const river = closestOnPolyline(RIVER_SEGMENTS, x, y, 0.1);
  return river.distance < riverHalfWidth(river.fraction);
}

export interface HeightGrid {
  columns: number;
  rows: number;
  /** Kilometres between samples. */
  spacing: number;
  /** Row-major heights in metres; row 0 is the south edge. */
  values: Float32Array;
  min: number;
  max: number;
}

let heightGridCache: HeightGrid | null = null;

/** Height samples every 31.25 m. The 3D mesh and the hillshade use the same grid. */
export function heightGrid(): HeightGrid {
  if (heightGridCache) return heightGridCache;
  const spacing = WORLD_WIDTH / 512;
  const columns = 513;
  const rows = Math.round(WORLD_DEPTH / spacing) + 1;
  const values = new Float32Array(columns * rows);
  let min = Infinity;
  let max = -Infinity;
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const value = heightAt(column * spacing, row * spacing);
      values[row * columns + column] = value;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  heightGridCache = { columns, rows, spacing, values, min, max };
  return heightGridCache;
}

/** Bilinear height from the shared grid, in metres. */
export function sampleHeight(grid: HeightGrid, x: number, y: number) {
  const gx = Math.min(grid.columns - 1.001, Math.max(0, x / grid.spacing));
  const gy = Math.min(grid.rows - 1.001, Math.max(0, y / grid.spacing));
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const at = (cx: number, cy: number) => grid.values[cy * grid.columns + cx];
  const south = at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx;
  const north = at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx;
  return south * (1 - fy) + north * fy;
}

// Places ---------------------------------------------------------------------

export interface Place {
  id: string;
  kind: "peak" | "water" | "settlement";
  name: string;
  point: Point;
}

export const PLACES: Place[] = [
  { id: "puncak-utara", kind: "peak", name: "Puncak Utara", point: { x: 3.3, y: 9.9 } },
  { id: "puncak-timur", kind: "peak", name: "Puncak Timur", point: { x: 13.1, y: 8.0 } },
  { id: "bukit-selatan", kind: "peak", name: "Bukit Selatan", point: { x: 14.1, y: 2.6 } },
  { id: "danau", kind: "water", name: "Danau Contoh", point: { x: 8.9, y: 10.8 } },
  { id: "sungai", kind: "water", name: "Sungai Contoh", point: { x: 3.05, y: 6.0 } },
  { id: "desa-a", kind: "settlement", name: "Desa Contoh A", point: { x: 2.9, y: 3.0 } },
  { id: "desa-b", kind: "settlement", name: "Desa Contoh B", point: { x: 14.7, y: 4.3 } },
  { id: "dusun-c", kind: "settlement", name: "Dusun Contoh C", point: { x: 7.6, y: 1.2 } },
];

export const ROADS: { kind: "road" | "track"; points: Point[] }[] = [
  {
    kind: "road",
    points: catmullRom(
      [
        { x: -0.2, y: 1.9 },
        { x: 1.4, y: 2.2 },
        { x: 2.6, y: 2.6 },
        { x: 3.0, y: 3.9 },
        { x: 3.9, y: 5.0 },
        { x: 3.6, y: 6.1 },
        { x: 4.5, y: 6.9 },
        { x: 5.2, y: 8.1 },
        { x: 6.4, y: 9.0 },
        { x: 7.0, y: 9.9 },
      ],
      12,
    ),
  },
  {
    kind: "road",
    points: catmullRom(
      [
        { x: 2.6, y: 2.6 },
        { x: 4.4, y: 2.3 },
        { x: 6.0, y: 2.5 },
        { x: 7.6, y: 1.3 },
        { x: 9.6, y: 1.9 },
        { x: 11.6, y: 2.9 },
        { x: 13.4, y: 3.7 },
        { x: 16.2, y: 4.6 },
      ],
      12,
    ),
  },
  {
    kind: "track",
    points: catmullRom(
      [
        { x: 6.0, y: 2.5 },
        { x: 5.7, y: 3.1 },
        { x: 6.3, y: 4.0 },
        { x: 7.2, y: 4.3 },
        { x: 8.4, y: 4.0 },
      ],
      10,
    ),
  },
];

export const BOUNDARY: Point[] = catmullRom(
  [
    { x: 9.9, y: -0.1 },
    { x: 9.5, y: 2.4 },
    { x: 10.4, y: 4.6 },
    { x: 9.8, y: 7.0 },
    { x: 10.9, y: 9.1 },
    { x: 10.4, y: 12.1 },
  ],
  8,
);

/** Building positions near each settlement, seeded so every build matches. */
export function structures(): Point[] {
  const random = seededRandom(404);
  const result: Point[] = [];
  for (const place of PLACES.filter((item) => item.kind === "settlement")) {
    for (let i = 0; i < 34; i++) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * 0.42;
      const point = { x: place.point.x + Math.cos(angle) * radius, y: place.point.y + Math.sin(angle) * radius };
      if (!isWater(point.x, point.y)) result.push(point);
    }
  }
  return result;
}

// Head path and modelled spread ---------------------------------------------

export const IGNITION_POINT: Point = { x: 5.6, y: 3.4 };

const HEAD_PATH: Point[] = catmullRom(
  [
    IGNITION_POINT,
    { x: 6.6, y: 4.3 },
    { x: 7.9, y: 5.3 },
    { x: 9.2, y: 6.3 },
    { x: 10.4, y: 7.4 },
    { x: 11.4, y: 8.4 },
    { x: 12.1, y: 9.2 },
    { x: 12.6, y: 9.8 },
    { x: 12.9, y: 10.25 },
  ],
  20,
);

const PATH_CUMULATIVE = HEAD_PATH.reduce<number[]>((sums, point, index) => {
  sums.push(index ? sums[index - 1] + Math.hypot(point.x - HEAD_PATH[index - 1].x, point.y - HEAD_PATH[index - 1].y) : 0);
  return sums;
}, []);
export const PATH_LENGTH_KM = PATH_CUMULATIVE[PATH_CUMULATIVE.length - 1];

export function headPath() {
  return HEAD_PATH;
}

/** Point and unit tangent at a distance along the head path, in kilometres. */
export function alongPath(distance: number) {
  const s = Math.max(0, Math.min(PATH_LENGTH_KM, distance));
  let low = 0;
  let high = PATH_CUMULATIVE.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (PATH_CUMULATIVE[middle] <= s) low = middle;
    else high = middle;
  }
  const a = HEAD_PATH[low];
  const b = HEAD_PATH[high];
  const length = PATH_CUMULATIVE[high] - PATH_CUMULATIVE[low] || 1;
  const t = (s - PATH_CUMULATIVE[low]) / length;
  const tangent = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  return { point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, tangent };
}

/** WIB clock hour for a time. */
export function wibClock(time: number) {
  const shifted = new Date(time + 7 * HOUR);
  return shifted.getUTCHours() + shifted.getUTCMinutes() / 60;
}

/** 1 near 15.00 WIB and 0 at night. */
export function diurnal(time: number) {
  const phase = Math.cos(((wibClock(time) - 15) / 24) * Math.PI * 2);
  return Math.max(0, phase) ** 1.4;
}

function rawRate(hours: number) {
  if (hours <= 0 || hours >= CONTAINED_HOURS) return 0;
  const start = 1 - Math.exp(-hours / 0.7);
  const gust = 0.9 * Math.exp(-(((hours - 2.4) / 0.9) ** 2)); // 16.50 WIB rapid growth
  const decline = hours < 40 ? 1 : Math.exp(-(hours - 40) / 9);
  return start * (0.28 + 0.72 * diurnal(IGNITION_AT + hours * HOUR) + gust) * decline;
}

const STEP_HOURS = 0.02;
const HEAD_TABLE: number[] = (() => {
  const values = [0];
  for (let hours = STEP_HOURS; hours <= CONTAINED_HOURS + STEP_HOURS; hours += STEP_HOURS)
    values.push(values[values.length - 1] + rawRate(hours - STEP_HOURS / 2) * STEP_HOURS);
  return values;
})();
// Scale the invented rate so the head reaches the end of the drawn path at containment.
const RATE_SCALE = (PATH_LENGTH_KM * 0.995) / HEAD_TABLE[HEAD_TABLE.length - 1];

/** Modelled head rate of spread in metres per hour. */
export function rateOfSpread(time: number) {
  return rawRate((time - IGNITION_AT) / HOUR) * RATE_SCALE * 1000;
}

/** Modelled head distance along the path, in kilometres. */
export function headDistance(time: number) {
  const index = Math.max(0, (time - IGNITION_AT) / HOUR / STEP_HOURS);
  const low = Math.min(HEAD_TABLE.length - 1, Math.floor(index));
  const high = Math.min(HEAD_TABLE.length - 1, low + 1);
  const value = HEAD_TABLE[low] + (HEAD_TABLE[high] - HEAD_TABLE[low]) * (index - low);
  return value * RATE_SCALE;
}

/** Time when the modelled head reached a path distance. */
export function timeAtDistance(distance: number) {
  const target = distance / RATE_SCALE;
  let low = 0;
  let high = HEAD_TABLE.length - 1;
  if (target >= HEAD_TABLE[high]) return CONTAINED_AT;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (HEAD_TABLE[middle] <= target) low = middle;
    else high = middle;
  }
  const span = HEAD_TABLE[high] - HEAD_TABLE[low] || 1;
  const hours = (low + (target - HEAD_TABLE[low]) / span) * STEP_HOURS;
  return IGNITION_AT + hours * HOUR;
}

export function headPoint(time: number) {
  return alongPath(headDistance(time)).point;
}

function flankWidth(distance: number, nowHours: number, side: 1 | -1) {
  const reachedHours = (timeAtDistance(distance) - IGNITION_AT) / HOUR;
  const age = Math.max(0, nowHours - reachedHours);
  const taper = 0.45 + 0.55 * smoothstep(0, 1.6, distance);
  const variation = 0.78 + 0.44 * fbm(distance * 1.3, side * 7.7, 3, side > 0 ? 71 : 73);
  const uphill = side > 0 ? 1.12 : 0.92;
  return (0.18 + 1.75 * (1 - Math.exp(-age / 13))) * taper * variation * uphill;
}

function arc(
  center: Point,
  radiusA: number,
  radiusB: number,
  from: Point,
  axis: Point,
  bulge: number,
  steps: number,
) {
  // Half-ellipse from the `from` side through `axis` to the opposite side.
  const points: Point[] = [];
  for (let i = 1; i < steps; i++) {
    const angle = (i / steps) * Math.PI;
    const side = Math.cos(angle) * (angle <= Math.PI / 2 ? radiusA : radiusB);
    const forward = Math.sin(angle) * bulge;
    points.push({
      x: center.x + from.x * side + axis.x * forward,
      y: center.y + from.y * side + axis.y * forward,
    });
  }
  return points;
}

/** Modelled main perimeter at a time, or null before ignition. */
export function perimeterAt(time: number): Point[] | null {
  const hours = (Math.min(time, CONTAINED_AT) - IGNITION_AT) / HOUR;
  if (hours <= 0.05) return null;
  const head = Math.max(0.02, headDistance(time));
  const steps = Math.max(8, Math.ceil(head / 0.06));
  const left: Point[] = [];
  const right: Point[] = [];
  let firstLeft = 0;
  let firstRight = 0;
  let lastLeft = 0;
  let lastRight = 0;
  for (let i = 0; i <= steps; i++) {
    const distance = (head * i) / steps;
    const { point, tangent } = alongPath(distance);
    const normal = { x: -tangent.y, y: tangent.x };
    const wl = flankWidth(distance, hours, 1);
    const wr = flankWidth(distance, hours, -1);
    if (i === 0) {
      firstLeft = wl;
      firstRight = wr;
    }
    lastLeft = wl;
    lastRight = wr;
    left.push({ x: point.x + normal.x * wl, y: point.y + normal.y * wl });
    right.push({ x: point.x - normal.x * wr, y: point.y - normal.y * wr });
  }
  const tip = alongPath(head);
  const tipNormal = { x: -tip.tangent.y, y: tip.tangent.x };
  const headCap = arc(
    tip.point,
    lastLeft,
    lastRight,
    tipNormal,
    tip.tangent,
    1.6 * Math.min(lastLeft, lastRight),
    14,
  );
  const tail = alongPath(0);
  const tailNormal = { x: -tail.tangent.y, y: tail.tangent.x };
  const backward = { x: -tail.tangent.x, y: -tail.tangent.y };
  const tailCap = arc(
    tail.point,
    firstRight,
    firstLeft,
    { x: -tailNormal.x, y: -tailNormal.y },
    backward,
    0.7 * Math.min(firstLeft, firstRight),
    10,
  );
  return [...left, ...headCap, ...right.reverse(), ...tailCap];
}

export const SPOT_AT = Date.parse("2026-09-08T20:12:00Z"); // 03.12 WIB, 9 Sep
const SPOT_DISTANCE = headDistance(SPOT_AT) + 0.85;
export const SPOT_POINT: Point = (() => {
  const { point, tangent } = alongPath(SPOT_DISTANCE);
  return { x: point.x - tangent.y * 0.28, y: point.y + tangent.x * 0.28 };
})();

const spotRadius = (time: number) => 0.04 + 0.1 * ((time - SPOT_AT) / HOUR);

/** When the main head reaches the spot fire. The spot stops growing on its own then. */
export const SPOT_MERGED_AT = (() => {
  for (let time = SPOT_AT; time < CONTAINED_AT; time += 60_000)
    if (headDistance(time) >= SPOT_DISTANCE - spotRadius(time)) return time;
  return CONTAINED_AT;
})();

/** A modelled spot fire ahead of the head. It keeps its merged size afterwards. */
export function spotFireAt(time: number): Point[] | null {
  if (time < SPOT_AT) return null;
  const radius = spotRadius(Math.min(time, SPOT_MERGED_AT));
  return Array.from({ length: 24 }, (_, index) => {
    const angle = (index / 24) * Math.PI * 2;
    const wobble = 1 + 0.18 * Math.sin(angle * 3 + 1.2);
    return {
      x: SPOT_POINT.x + Math.cos(angle) * radius * wobble,
      y: SPOT_POINT.y + Math.sin(angle) * radius * wobble * 0.8,
    };
  });
}

/** Modelled burnt area in hectares: the main perimeter plus any spot area outside it. */
export function areaHectares(time: number) {
  const main = perimeterAt(time);
  const spot = spotFireAt(time);
  let km2 = main ? polygonAreaKm2(main) : 0;
  if (spot) {
    const xs = spot.map((point) => point.x);
    const ys = spot.map((point) => point.y);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    let inside = 0;
    let outside = 0;
    for (let i = 0; i < 16; i++)
      for (let j = 0; j < 16; j++) {
        const point = { x: minX + ((i + 0.5) / 16) * (maxX - minX), y: minY + ((j + 0.5) / 16) * (maxY - minY) };
        if (!pointInPolygon(point, spot)) continue;
        inside++;
        if (!main || !pointInPolygon(point, main)) outside++;
      }
    km2 += polygonAreaKm2(spot) * (inside ? outside / inside : 1);
  }
  return km2 * 100;
}

/** WIB clock times along the head path that the map labels. */
export const PATH_MARKS = [
  "2026-09-08T11:00:00Z",
  "2026-09-08T17:00:00Z",
  "2026-09-08T23:00:00Z",
  "2026-09-09T05:00:00Z",
  "2026-09-09T17:00:00Z",
].map((iso) => Date.parse(iso));

/** Times of earlier modelled perimeters drawn as thin isochrones. */
export const ISOCHRONES = Array.from({ length: 11 }, (_, index) => Date.parse("2026-09-08T11:00:00Z") + index * 6 * HOUR);

const RIDGE_DISTANCE = (() => {
  let best = { distance: 0, score: Infinity };
  for (let s = 0; s <= PATH_LENGTH_KM; s += 0.01) {
    const { point } = alongPath(s);
    const score = Math.abs((point.x - RIDGE.x) * -RIDGE.dy + (point.y - RIDGE.y) * RIDGE.dx);
    if (score < best.score) best = { distance: s, score };
  }
  return best.distance;
})();

// Weather (invented, at the modelled head) ----------------------------------------

const COMPASS = ["U", "UTL", "TL", "TTL", "T", "TMg", "Tg", "SMg", "S", "SBD", "BD", "BBD", "B", "BBL", "BL", "UBL"];

export function weatherAt(time: number) {
  const day = diurnal(time);
  const hours = (time - IGNITION_AT) / HOUR;
  const gust = Math.exp(-(((hours - 2.4) / 0.9) ** 2));
  const rain = smoothstep(44, 50, hours);
  const windFrom = 246 + 9 * Math.sin(hours / 5);
  const rate = rateOfSpread(time);
  return {
    windKmh: 7 + 15 * day + 14 * gust,
    windFrom,
    windLabel: COMPASS[Math.round(windFrom / 22.5) % 16],
    temperatureC: 24 + 9 * day - 2 * rain,
    humidity: Math.min(97, 88 - 50 * day + 20 * rain),
    fuelMoisture: 6 + 14 * (1 - day) + 10 * rain,
    dangerIndex: Math.max(1, 6 + 24 * day * (1 - rain * 0.7)),
    flameLengthM: rate > 0 ? 0.4 + rate / 260 : 0,
    rate,
  };
}

// Satellite passes and detections (synthetic VIIRS-like records) -------------

export type Confidence = "rendah" | "nominal" | "tinggi";

export interface SatellitePass {
  id: string;
  at: number;
  satellite: "NOAA-20" | "NOAA-21" | "Suomi NPP";
  /** True when cloud hides the ground. No detection then does not mean no fire. */
  obscured: boolean;
}

export interface SceneDetection {
  id: string;
  passId: string;
  at: number;
  point: Point;
  confidence: Confidence;
  satellite: SatellitePass["satellite"];
}

const PASS_CLOCK: [string, SatellitePass["satellite"]][] = [
  ["17:38", "NOAA-21"],
  ["18:03", "NOAA-20"],
  ["18:52", "Suomi NPP"],
  ["05:47", "NOAA-21"],
  ["06:12", "NOAA-20"],
  ["07:01", "Suomi NPP"],
];
const OBSCURED_PASS = Date.parse("2026-09-10T06:12:00Z");

export function satellitePasses(): SatellitePass[] {
  const passes: SatellitePass[] = [];
  // Clock times are UTC: 17.38 UTC is 00.38 WIB on the next day.
  for (const day of ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10"])
    for (const [clock, satellite] of PASS_CLOCK) {
      const at = Date.parse(`${day}T${clock}:00Z`);
      if (at > IGNITION_AT && at <= TIMELINE_END) passes.push({ id: "", at, satellite, obscured: at === OBSCURED_PASS });
    }
  return passes
    .sort((a, b) => a.at - b.at)
    .map((pass, index) => ({ ...pass, id: `lintasan-${index + 1}` }));
}

let detectionCache: SceneDetection[] | null = null;

export function sceneDetections(): SceneDetection[] {
  if (detectionCache) return detectionCache;
  const result: SceneDetection[] = [];
  satellitePasses().forEach((pass, passIndex) => {
    if (pass.obscured) return;
    const now = perimeterAt(pass.at);
    if (!now) return;
    const before = perimeterAt(pass.at - 5 * HOUR);
    const spot = spotFireAt(pass.at);
    const spotBefore = spotFireAt(pass.at - 5 * HOUR);
    const random = seededRandom(9100 + passIndex);
    const head = headPoint(pass.at);
    const contained = pass.at >= CONTAINED_AT;
    const xs = now.map((point) => point.x);
    const ys = now.map((point) => point.y);
    const step = 0.375; // VIIRS I-band pixel size in kilometres
    for (let x = Math.min(...xs) - step; x <= Math.max(...xs) + step; x += step)
      for (let y = Math.min(...ys) - step; y <= Math.max(...ys) + step; y += step) {
        const point = { x: x + (random() - 0.5) * 0.16, y: y + (random() - 0.5) * 0.16 };
        const roll = random();
        const inMain = pointInPolygon(point, now);
        const inSpot = spot ? pointInPolygon(point, spot) : false;
        if (!inMain && !inSpot) continue;
        const burntBefore =
          (before ? pointInPolygon(point, before) : false) ||
          (spotBefore ? pointInPolygon(point, spotBefore) : false);
        const front = !burntBefore;
        let confidence: Confidence | null = null;
        if (front && !contained && roll < 0.82) {
          const nearHead = Math.hypot(point.x - head.x, point.y - head.y) < 1.3;
          confidence = nearHead || roll < 0.3 ? "tinggi" : "nominal";
        } else if (!front && roll < (contained ? 0.05 : 0.07)) {
          confidence = "rendah"; // smouldering ground behind the front
        }
        if (confidence)
          result.push({
            id: `sim-${passIndex + 1}-${result.length + 1}`,
            passId: pass.id,
            at: pass.at,
            point,
            confidence,
            satellite: pass.satellite,
          });
      }
  });
  detectionCache = result;
  return result;
}

// Suppression (invented) ---------------------------------------------------------

export interface WaterDrop {
  at: number;
  point: Point;
}

let dropCache: WaterDrop[] | null = null;

export function waterDrops(): WaterDrop[] {
  if (dropCache) return dropCache;
  const random = seededRandom(5150);
  const drops: WaterDrop[] = [];
  const windows = [
    [Date.parse("2026-09-09T01:40:00Z"), Date.parse("2026-09-09T10:00:00Z")],
    [Date.parse("2026-09-10T01:00:00Z"), Date.parse("2026-09-10T09:30:00Z")],
  ];
  for (const [start, end] of windows)
    for (let at = start; at <= end; at += 35 * 60_000) {
      const hours = (at - IGNITION_AT) / HOUR;
      const head = headDistance(at);
      const distance = head * (0.45 + random() * 0.5);
      const side = random() < 0.7 ? 1 : -1;
      const { point, tangent } = alongPath(distance);
      const width = flankWidth(distance, hours, side) + 0.04;
      drops.push({
        at,
        point: { x: point.x - tangent.y * width * side, y: point.y + tangent.x * width * side },
      });
    }
  dropCache = drops;
  return drops;
}

export const FIREBREAK_START = Date.parse("2026-09-09T06:00:00Z");
export const FIREBREAK_DONE = Date.parse("2026-09-10T08:00:00Z");

let firebreakCache: Point[] | null = null;

/** A firebreak line outside the final north-west flank. */
export function firebreak(): Point[] {
  if (firebreakCache) return firebreakCache;
  const hours = CONTAINED_HOURS;
  const points: Point[] = [];
  for (let s = PATH_LENGTH_KM * 0.42; s <= PATH_LENGTH_KM * 0.86; s += 0.08) {
    const { point, tangent } = alongPath(s);
    const width = flankWidth(s, hours, 1) + 0.22;
    points.push({ x: point.x - tangent.y * width, y: point.y + tangent.x * width });
  }
  firebreakCache = points;
  return points;
}

/** Ignition-area likelihood from 0 to 1. An estimate, not a cause finding. */
export function ignitionLikelihood(x: number, y: number) {
  return Math.min(
    1,
    0.95 * gauss(x, y, IGNITION_POINT.x - 0.08, IGNITION_POINT.y - 0.05, 0.3) +
      0.35 * gauss(x, y, IGNITION_POINT.x + 0.55, IGNITION_POINT.y - 0.3, 0.22),
  );
}

// Events -------------------------------------------------------------------------

export type EventKind =
  | "ignition"
  | "growth"
  | "detection"
  | "spot"
  | "water"
  | "ridge"
  | "cloud"
  | "firebreak"
  | "contained";

export interface IncidentEvent {
  id: string;
  kind: EventKind;
  at: number;
  title: string;
  detail: string;
  point: Point | null;
}

let eventCache: IncidentEvent[] | null = null;

export function incidentEvents(): IncidentEvent[] {
  if (eventCache) return eventCache;
  const firstPass = satellitePasses().find((pass) =>
    sceneDetections().some((detection) => detection.passId === pass.id),
  );
  const growthAt = Date.parse("2026-09-08T09:50:00Z");
  const ridgeAt = timeAtDistance(RIDGE_DISTANCE);
  const firebreakLine = firebreak();
  const events: IncidentEvent[] = [
    {
      id: "titik-awal",
      kind: "ignition",
      at: IGNITION_AT,
      title: "Titik awal (perkiraan)",
      detail: "Perkiraan dari arah sebaran. Bukan penentuan penyebab.",
      point: IGNITION_POINT,
    },
    {
      id: "pertumbuhan-cepat",
      kind: "growth",
      at: growthAt,
      title: "Pertumbuhan cepat (model)",
      detail: "Hembusan angin barat daya menaikkan laju model.",
      point: headPoint(growthAt),
    },
    ...(firstPass
      ? [
          {
            id: "deteksi-pertama",
            kind: "detection" as const,
            at: firstPass.at,
            title: "Deteksi satelit pertama",
            detail: `${firstPass.satellite}. Satelit tidak mengamati terus-menerus.`,
            point: null,
          },
        ]
      : []),
    {
      id: "api-loncat",
      kind: "spot",
      at: SPOT_AT,
      title: "Api loncat (perkiraan)",
      detail: "Bara terbawa angin ke depan kepala api.",
      point: SPOT_POINT,
    },
    {
      id: "water-bombing",
      kind: "water",
      at: waterDrops()[0].at,
      title: "Water bombing pertama",
      detail: "Contoh catatan pemadaman dari udara.",
      point: waterDrops()[0].point,
    },
    {
      id: "punggung-bukit",
      kind: "ridge",
      at: ridgeAt,
      title: "Melintasi punggung bukit",
      detail: "Kepala api model melewati punggung bukit timur.",
      point: alongPath(RIDGE_DISTANCE).point,
    },
    {
      id: "tertutup-awan",
      kind: "cloud",
      at: OBSCURED_PASS,
      title: "Lintasan tertutup awan",
      detail: "NOAA-20 tidak melihat permukaan. Tanpa deteksi bukan berarti padam.",
      point: null,
    },
    {
      id: "sekat-bakar",
      kind: "firebreak",
      at: FIREBREAK_DONE,
      title: "Sekat bakar utara selesai",
      detail: "Contoh catatan pemadaman darat.",
      point: firebreakLine[firebreakLine.length - 1],
    },
    {
      id: "terkendali",
      kind: "contained",
      at: CONTAINED_AT,
      title: "Terkendali (contoh status)",
      detail: "Deteksi sesudahnya dapat berasal dari gambut yang membara.",
      point: headPoint(CONTAINED_AT),
    },
  ];
  eventCache = events.sort((a, b) => a.at - b.at);
  return eventCache;
}

// Chart series -------------------------------------------------------------------

export interface SeriesPoint {
  x: number;
  y: number;
}

let areaCache: SeriesPoint[] | null = null;
let rateCache: SeriesPoint[] | null = null;
let profileCache: SeriesPoint[] | null = null;

export function areaSeries(): SeriesPoint[] {
  if (!areaCache) {
    areaCache = [];
    for (let at = TIMELINE_START; at <= TIMELINE_END; at += 30 * 60_000) areaCache.push({ x: at, y: areaHectares(at) });
  }
  return areaCache;
}

export function rateSeries(): SeriesPoint[] {
  if (!rateCache) {
    rateCache = [];
    for (let at = TIMELINE_START; at <= TIMELINE_END; at += 15 * 60_000) rateCache.push({ x: at, y: rateOfSpread(at) });
  }
  return rateCache;
}

/** Elevation along the head path: x in kilometres from the ignition point, y in metres. */
export function elevationProfile(): SeriesPoint[] {
  if (!profileCache) {
    profileCache = [];
    for (let s = 0; s <= PATH_LENGTH_KM + 1e-9; s += 0.1) {
      const { point } = alongPath(s);
      profileCache.push({ x: s, y: heightAt(point.x, point.y) });
    }
  }
  return profileCache;
}

// Formatting ---------------------------------------------------------------------

/** Deterministic Indonesian number format, so prerendered HTML matches hydration. */
export function formatNumber(value: number, digits = 0) {
  const [whole, fraction] = Math.abs(value).toFixed(digits).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const negative = value < 0 && Number(Math.abs(value).toFixed(digits)) !== 0;
  return `${negative ? "−" : ""}${grouped}${fraction ? `,${fraction}` : ""}`;
}

export const INCIDENT = {
  name: "Kejadian sintetis Lereng Contoh",
  id: "KA-SIM-2026-001",
  location: "Wilayah fiktif, bukan lokasi nyata",
  cause: "Tidak ditentukan",
};
