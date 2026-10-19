// Canvas painting for the Indonesia seed preview: land cover or a height tint,
// hill shading from the local DEM, Natural Earth rivers and lakes, neighbouring
// land, and the simplified outline. The flat fallback also paints the
// detections. Orange stays reserved for satellite detections (ADR 0003).
import {
  LANDCOVER_CLASSES,
  type Detections,
  type PreviewFeatures,
  type RasterGrid,
} from "./indonesia-data";
import { INDONESIA_PATH, MAP_ORIGIN, MAP_SCALE, NEIGHBOUR_PATH } from "./map-geometry";

export interface SeedLayers {
  landcover: boolean;
  terrain: boolean;
  shade: boolean;
  water: boolean;
  places: boolean;
  outline: boolean;
  detections: boolean;
}

export interface PaintExtras {
  landcover?: Uint8Array | null;
  features?: PreviewFeatures | null;
}

export const SEED_PAINT = {
  sea: "#b9cdd2",
  river: "#5f93a8",
  lakeEdge: "#5f93a8",
  neighbour: "#ddd6c7",
  neighbourEdge: "rgba(38, 32, 26, 0.28)",
  outline: "rgba(38, 32, 26, 0.6)",
  /** Detection fill by confidence: rendah, nominal, tinggi. */
  detect: ["#ffd2b0", "#ff8b4a", "#d9480f"],
  detectStroke: "#6b2604",
} as const;

type Rgb = [number, number, number];
const FLAT: Rgb = [0xe7, 0xde, 0xcd];
const STOPS: [number, Rgb][] = [
  [0, [92, 126, 82]],
  [100, [122, 148, 94]],
  [300, [166, 170, 110]],
  [700, [196, 176, 124]],
  [1500, [170, 134, 98]],
  [2500, [138, 106, 84]],
  [3500, [178, 162, 150]],
  [4500, [246, 244, 238]],
];

/** Height tint for a land height in metres. */
export function tint(metres: number): Rgb {
  if (metres <= STOPS[0][0]) return STOPS[0][1];
  for (let i = 1; i < STOPS.length; i++) {
    const [to, high] = STOPS[i];
    if (metres <= to) {
      const [from, low] = STOPS[i - 1];
      const t = (metres - from) / (to - from);
      return [
        low[0] + t * (high[0] - low[0]),
        low[1] + t * (high[1] - low[1]),
        low[2] + t * (high[2] - low[2]),
      ];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

// Lookup tables: height tint per 10 m, and land cover colour per class value.
const TINT = Array.from({ length: 601 }, (_, i) => tint(i * 10));
const COVER = new Map<number, Rgb>(LANDCOVER_CLASSES.map(({ value, colour }) => [value, colour]));

/** Draw a map-geometry path in grid pixels. */
function mapPath(ctx: CanvasRenderingContext2D, grid: RasterGrid, path: string) {
  const k = 1 / (MAP_SCALE * grid.cell);
  ctx.setTransform(
    k,
    0,
    0,
    k,
    (MAP_ORIGIN.longitude - grid.west) / grid.cell,
    (grid.north - MAP_ORIGIN.latitude) / grid.cell,
  );
  return { shape: new Path2D(path), unit: 1 / k };
}

/**
 * Paint one pixel per grid cell. Cells with nodata are outside Indonesia.
 * Cells at 0 m or below are water unless land cover gives a land class.
 */
export function paintTerrain(
  canvas: HTMLCanvasElement,
  grid: RasterGrid,
  heights: Int16Array,
  layers: Pick<SeedLayers, "landcover" | "terrain" | "shade" | "water" | "outline">,
  extras: PaintExtras = {},
) {
  canvas.width = grid.width;
  canvas.height = grid.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available");
  const image = ctx.createImageData(grid.width, grid.height);
  const pixels = image.data;
  const cover = layers.landcover ? extras.landcover : null;
  // Stronger relief in coarse cells, where real slopes average out.
  const zFactor = Math.max(1.5, Math.min(4, grid.cell * 240));
  const dy = grid.cell * 110_574;
  const at = (x: number, y: number) => {
    const value =
      heights[
        Math.max(0, Math.min(grid.height - 1, y)) * grid.width +
          Math.max(0, Math.min(grid.width - 1, x))
      ];
    return value === grid.nodata || value < 0 ? 0 : value;
  };
  for (let y = 0; y < grid.height; y++) {
    const latitude = grid.north - (y + 0.5) * grid.cell;
    const dx = grid.cell * 111_320 * Math.cos((latitude * Math.PI) / 180);
    for (let x = 0; x < grid.width; x++) {
      const index = y * grid.width + x;
      const value = heights[index];
      if (value === grid.nodata) continue;
      const kind = cover ? cover[index] : 0;
      if (kind === 80 || (value <= 0 && !kind)) continue;
      let rgb: Rgb = kind
        ? (COVER.get(kind) ?? FLAT)
        : layers.terrain
          ? TINT[Math.min(600, Math.max(0, Math.round(value / 10)))]
          : FLAT;
      if (layers.shade) {
        // Light from the north-west, 45 degrees above the horizon: L = (-0.5, -0.5, 0.707)
        // in (east, south, up). The surface normal is (-gx, -gy, 1), normalized.
        const gx = ((at(x + 1, y) - at(x - 1, y)) * zFactor) / (2 * dx);
        const gy = ((at(x, y + 1) - at(x, y - 1)) * zFactor) / (2 * dy);
        const shade = Math.max(
          0,
          (0.5 * gx + 0.5 * gy + Math.SQRT1_2) / Math.sqrt(gx * gx + gy * gy + 1),
        );
        const factor = 0.6 + 0.58 * shade;
        rgb = [rgb[0] * factor, rgb[1] * factor, rgb[2] * factor];
      }
      pixels[index * 4] = rgb[0];
      pixels[index * 4 + 1] = rgb[1];
      pixels[index * 4 + 2] = rgb[2];
      pixels[index * 4 + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  // Neighbouring land and the sea go behind the Indonesia cells.
  ctx.save();
  ctx.globalCompositeOperation = "destination-over";
  const neighbours = mapPath(ctx, grid, NEIGHBOUR_PATH);
  ctx.fillStyle = SEED_PAINT.neighbour;
  ctx.fill(neighbours.shape);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = SEED_PAINT.sea;
  ctx.fillRect(0, 0, grid.width, grid.height);
  ctx.restore();

  const features = extras.features;
  if (layers.water && features) {
    // Line widths in pixels grow in fine grids, so rivers stay visible.
    const scale = Math.max(1, Math.sqrt(0.00833 / grid.cell));
    const toX = (longitude: number) => (longitude - grid.west) / grid.cell;
    const toY = (latitude: number) => (grid.north - latitude) / grid.cell;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.fillStyle = SEED_PAINT.sea;
    ctx.strokeStyle = SEED_PAINT.lakeEdge;
    ctx.lineWidth = 0.8 * scale;
    for (const lake of features.lakes) {
      const shape = new Path2D();
      for (const ring of lake.rings) {
        for (let i = 0; i < ring.length; i += 2) {
          if (i === 0) shape.moveTo(toX(ring[i]), toY(ring[i + 1]));
          else shape.lineTo(toX(ring[i]), toY(ring[i + 1]));
        }
        shape.closePath();
      }
      ctx.fill(shape, "evenodd");
      ctx.stroke(shape);
    }
    ctx.strokeStyle = SEED_PAINT.river;
    for (const river of features.rivers) {
      ctx.lineWidth = Math.max(0.8, 1.8 - river.rank * 0.12) * scale;
      ctx.beginPath();
      for (let i = 0; i < river.points.length; i += 2) {
        if (i === 0) ctx.moveTo(toX(river.points[i]), toY(river.points[i + 1]));
        else ctx.lineTo(toX(river.points[i]), toY(river.points[i + 1]));
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.save();
  const edge = mapPath(ctx, grid, NEIGHBOUR_PATH);
  ctx.strokeStyle = SEED_PAINT.neighbourEdge;
  ctx.lineWidth = edge.unit;
  ctx.stroke(edge.shape);
  if (layers.outline) {
    const indonesia = mapPath(ctx, grid, INDONESIA_PATH);
    ctx.strokeStyle = SEED_PAINT.outline;
    ctx.lineWidth = 1.4 * indonesia.unit;
    ctx.lineJoin = "round";
    ctx.stroke(indonesia.shape);
  }
  ctx.restore();
}

/** Paint detections as dots, for the flat map without WebGL. */
export function paintDetections(
  canvas: HTMLCanvasElement,
  grid: RasterGrid,
  detections: Detections,
  indices: Uint32Array,
  scale = 1,
) {
  canvas.width = grid.width * scale;
  canvas.height = grid.height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = SEED_PAINT.detectStroke;
  for (let level = 0; level < 3; level++) {
    ctx.fillStyle = SEED_PAINT.detect[level];
    ctx.beginPath();
    for (const i of indices) {
      if (detections.confidence[i] !== level) continue;
      const x = ((detections.longitude[i] - grid.west) / grid.cell) * scale;
      const y = ((grid.north - detections.latitude[i]) / grid.cell) * scale;
      ctx.moveTo(x + 2.4, y);
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
  }
}
