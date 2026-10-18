// Paints the synthetic incident map into one canvas. The 3D view drapes this canvas
// over the terrain; without WebGL the page shows it as a flat map. All drawing is
// local: there are no remote tiles or images (ADR 0003).
import {
  BOUNDARY,
  CONTAINED_AT,
  FIREBREAK_DONE,
  FIREBREAK_START,
  IGNITION_POINT,
  ISOCHRONES,
  LAKE,
  PLACES,
  RIVER,
  ROADS,
  SPOT_MERGED_AT,
  WORLD_DEPTH,
  WORLD_WIDTH,
  alongPath,
  fbm,
  firebreak,
  headDistance,
  headPath,
  heightGrid,
  ignitionLikelihood,
  perimeterAt,
  pointInPolygon,
  rateOfSpread,
  riverDistance,
  riverHalfWidth,
  sceneDetections,
  seededRandom,
  smoothstep,
  spotFireAt,
  structures,
  waterDrops,
  weatherAt,
  type Point,
} from "./scenario";

export type LayerId =
  | "terrain"
  | "landcover"
  | "burn"
  | "spread"
  | "detections"
  | "ignition"
  | "wind"
  | "suppression"
  | "structures"
  | "roads"
  | "boundaries";

export interface LayerSetting {
  visible: boolean;
  /** 0 to 1. */
  opacity: number;
}

export type LayerSettings = Record<LayerId, LayerSetting>;

export const LAYERS: { id: LayerId; label: string; note: string; visible: boolean; opacity: number }[] = [
  { id: "terrain", label: "Medan 3D", note: "Relief dan bayangan bukit", visible: true, opacity: 1 },
  { id: "landcover", label: "Tutupan lahan", note: "Gambar sintetis, bukan citra", visible: true, opacity: 1 },
  { id: "burn", label: "Bekas terbakar (dNBR)", note: "Tingkat keparahan, contoh", visible: true, opacity: 0.9 },
  { id: "spread", label: "Sebaran api (model)", note: "Model, bukan pengamatan", visible: true, opacity: 1 },
  { id: "detections", label: "Deteksi satelit (VIIRS)", note: "Belum tentu kebakaran", visible: true, opacity: 1 },
  { id: "ignition", label: "Area titik awal", note: "Perkiraan, bukan penyebab", visible: true, opacity: 0.8 },
  { id: "wind", label: "Angin (vektor)", note: "Arah dan kecepatan model", visible: false, opacity: 0.7 },
  { id: "suppression", label: "Pemadaman", note: "Water bombing dan sekat bakar", visible: true, opacity: 1 },
  { id: "structures", label: "Bangunan", note: "Titik bangunan fiktif", visible: false, opacity: 1 },
  { id: "roads", label: "Jalan dan jalur", note: "Jalan desa dan jalur kebun", visible: true, opacity: 1 },
  { id: "boundaries", label: "Batas wilayah", note: "Batas desa fiktif", visible: false, opacity: 1 },
];

export function defaultLayers(): LayerSettings {
  return Object.fromEntries(
    LAYERS.map((layer) => [layer.id, { visible: layer.visible, opacity: layer.opacity }]),
  ) as LayerSettings;
}

export const TEXTURE_WIDTH = 2048;
export const TEXTURE_HEIGHT = 1536;
const PX = TEXTURE_WIDTH / WORLD_WIDTH;
const HOUR = 3_600_000;

/** Map colours. Orange stays reserved for satellite detections (ADR 0003). */
export const PAINT = {
  paper: "#efe8da",
  ink: "#26201a",
  water: "#5f8fa3",
  waterEdge: "#3f6b7d",
  detectFill: "rgba(255, 139, 74, 0.82)",
  detectStroke: "#b23c05",
  front: "#d81f5c",
  path: "#fff6dc",
  drop: "#2f7fbf",
  firebreak: "#5a3b1a",
  wind: "#173a5e",
  boundary: "#4b3f72",
  severity: ["#d9b48f", "#a8684a", "#6b3a2c", "#2f2420"],
  ignition: "#7b2fbf",
} as const;

const toPx = (point: Point) => ({ x: point.x * PX, y: (WORLD_DEPTH - point.y) * PX });

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  return ctx;
}

function polygonPath(path: Path2D, polygon: Point[]) {
  polygon.forEach((point, index) => {
    const p = toPx(point);
    if (index) path.lineTo(p.x, p.y);
    else path.moveTo(p.x, p.y);
  });
  path.closePath();
}

function linePath(ctx: CanvasRenderingContext2D, line: Point[]) {
  ctx.beginPath();
  line.forEach((point, index) => {
    const p = toPx(point);
    if (index) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  });
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
type Rgb = [number, number, number];
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

const GRASS: Rgb = [201, 181, 134];
const DRY: Rgb = [176, 160, 112];
const FOREST: Rgb = [70, 96, 54];
const DEEP_FOREST: Rgb = [48, 72, 44];
const PEAT: Rgb = [58, 84, 52];
const SETTLEMENT: Rgb = [216, 203, 174];
const PLANTATION: Rgb[] = [
  [104, 132, 62],
  [124, 146, 72],
  [158, 160, 100],
];

function blockHash(x: number, y: number) {
  return Math.abs(Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1;
}

/** Land-cover colour and forest density for one point. */
function landCover(x: number, y: number, height: number): { rgb: Rgb; forest: number } {
  const n = fbm(x * 0.9, y * 0.9, 4, 21);
  const detail = fbm(x * 3.1, y * 3.1, 3, 41) - 0.5;
  if (riverDistance(x, y, 0.7) < 0.7 && height < 150) return { rgb: mixRgb(PEAT, FOREST, detail + 0.4), forest: 0.85 };
  if (x > 9.6 && y < 5.2 && height < 300) {
    const bx = x / 0.55;
    const by = y / 0.42;
    if (bx % 1 < 0.06 || by % 1 < 0.08) return { rgb: GRASS, forest: 0 };
    const shade = PLANTATION[Math.floor(blockHash(Math.floor(bx), Math.floor(by)) * PLANTATION.length)];
    return { rgb: mixRgb(shade, FOREST, 0.1 + detail * 0.2), forest: 0.15 };
  }
  const forest = smoothstep(0.44, 0.62, n + (height - 320) / 2600);
  let rgb = mixRgb(mixRgb(GRASS, DRY, detail + 0.5), height > 600 ? DEEP_FOREST : FOREST, forest);
  for (const place of PLACES)
    if (place.kind === "settlement") {
      const distance = Math.hypot(x - place.point.x, y - place.point.y);
      if (distance < 0.55) rgb = mixRgb(rgb, SETTLEMENT, smoothstep(0.55, 0.2, distance));
    }
  return { rgb: rgb.map((value) => value + detail * 18) as Rgb, forest };
}

interface StaticLayers {
  color: HTMLCanvasElement;
  shade: HTMLCanvasElement;
  trees: HTMLCanvasElement;
  water: HTMLCanvasElement;
  roads: HTMLCanvasElement;
  boundaries: HTMLCanvasElement;
  structures: HTMLCanvasElement;
  severity: HTMLCanvasElement;
  ignition: HTMLCanvasElement;
}

function buildStaticLayers(): StaticLayers {
  const grid = heightGrid();
  const width = grid.columns - 1;
  const height = grid.rows - 1;
  const color = makeCanvas(width, height);
  const shade = makeCanvas(width, height);
  const colorData = context(color).createImageData(width, height);
  const shadeData = context(shade).createImageData(width, height);
  const forestDensity = new Float32Array(width * height);
  const exaggeration = 1.8;
  const light = { x: -0.5, y: 0.5, z: Math.SQRT1_2 }; // from the north-west, 45 degrees high
  for (let row = 0; row < height; row++) {
    const gridRow = grid.rows - 1 - row;
    for (let column = 0; column < width; column++) {
      const x = (column + 0.5) * grid.spacing;
      const y = (gridRow - 0.5) * grid.spacing;
      const at = (c: number, r: number) =>
        grid.values[Math.min(grid.rows - 1, Math.max(0, r)) * grid.columns + Math.min(grid.columns - 1, Math.max(0, c))];
      const h = at(column, gridRow);
      const dzdx = ((at(column + 1, gridRow) - at(column - 1, gridRow)) / (2000 * grid.spacing)) * exaggeration;
      const dzdy = ((at(column, gridRow + 1) - at(column, gridRow - 1)) / (2000 * grid.spacing)) * exaggeration;
      const length = Math.hypot(dzdx, dzdy, 1);
      const lit = (-dzdx * light.x - dzdy * light.y + light.z) / length;
      const index = (row * width + column) * 4;
      const value = Math.max(58, Math.min(220, 128 + (lit - light.z) * 190));
      shadeData.data[index] = value;
      shadeData.data[index + 1] = value;
      shadeData.data[index + 2] = value;
      shadeData.data[index + 3] = 255;
      const cover = landCover(x, y, h);
      forestDensity[row * width + column] = cover.forest;
      colorData.data[index] = cover.rgb[0];
      colorData.data[index + 1] = cover.rgb[1];
      colorData.data[index + 2] = cover.rgb[2];
      colorData.data[index + 3] = 255;
    }
  }
  context(color).putImageData(colorData, 0, 0);
  context(shade).putImageData(shadeData, 0, 0);

  // Tree crowns as small sprites, so the draped map reads as forest from close up.
  const trees = makeCanvas(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  const treeCtx = context(trees);
  const sprite = makeCanvas(10, 10);
  const spriteCtx = context(sprite);
  const gradient = spriteCtx.createRadialGradient(4, 4, 0.5, 5, 5, 5);
  gradient.addColorStop(0, "rgba(120, 150, 86, 0.95)");
  gradient.addColorStop(0.6, "rgba(38, 60, 32, 0.9)");
  gradient.addColorStop(1, "rgba(20, 32, 18, 0)");
  spriteCtx.fillStyle = gradient;
  spriteCtx.fillRect(0, 0, 10, 10);
  const random = seededRandom(77);
  for (let i = 0; i < 70_000; i++) {
    const px = random() * TEXTURE_WIDTH;
    const py = random() * TEXTURE_HEIGHT;
    const density = forestDensity[Math.floor((py / TEXTURE_HEIGHT) * height) * width + Math.floor((px / TEXTURE_WIDTH) * width)];
    if (random() > density * 0.9) continue;
    const size = 5 + random() * 6;
    treeCtx.drawImage(sprite, px - size / 2, py - size / 2, size, size);
  }

  const water = makeCanvas(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  const waterCtx = context(water);
  waterCtx.lineCap = "round";
  waterCtx.lineJoin = "round";
  for (let i = 0; i < RIVER.length - 1; i++) {
    const fraction = i / (RIVER.length - 1);
    waterCtx.strokeStyle = PAINT.water;
    waterCtx.lineWidth = riverHalfWidth(fraction) * 2 * PX;
    linePath(waterCtx, [RIVER[i], RIVER[i + 1]]);
    waterCtx.stroke();
  }
  const lake = toPx(LAKE);
  waterCtx.save();
  waterCtx.translate(lake.x, lake.y);
  waterCtx.rotate(-LAKE.angle);
  waterCtx.beginPath();
  waterCtx.ellipse(0, 0, LAKE.rx * PX, LAKE.ry * PX, 0, 0, Math.PI * 2);
  const lakeFill = waterCtx.createLinearGradient(0, -LAKE.ry * PX, 0, LAKE.ry * PX);
  lakeFill.addColorStop(0, "#6f9fb2");
  lakeFill.addColorStop(1, "#4d7d92");
  waterCtx.fillStyle = lakeFill;
  waterCtx.fill();
  waterCtx.strokeStyle = PAINT.waterEdge;
  waterCtx.lineWidth = 3;
  waterCtx.stroke();
  waterCtx.restore();

  const roads = makeCanvas(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  const roadCtx = context(roads);
  roadCtx.lineCap = "round";
  roadCtx.lineJoin = "round";
  for (const road of ROADS) {
    if (road.kind === "road") {
      linePath(roadCtx, road.points);
      roadCtx.strokeStyle = "#4d3e2e";
      roadCtx.lineWidth = 8;
      roadCtx.stroke();
      roadCtx.strokeStyle = "#efe3c8";
      roadCtx.lineWidth = 4.5;
      roadCtx.stroke();
    } else {
      linePath(roadCtx, road.points);
      roadCtx.setLineDash([10, 7]);
      roadCtx.strokeStyle = "#5e4c38";
      roadCtx.lineWidth = 3;
      roadCtx.stroke();
      roadCtx.setLineDash([]);
    }
  }

  const boundaries = makeCanvas(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  const boundaryCtx = context(boundaries);
  linePath(boundaryCtx, BOUNDARY);
  boundaryCtx.strokeStyle = "rgba(255, 253, 247, 0.85)";
  boundaryCtx.lineWidth = 7;
  boundaryCtx.stroke();
  boundaryCtx.setLineDash([22, 8, 4, 8]);
  boundaryCtx.strokeStyle = PAINT.boundary;
  boundaryCtx.lineWidth = 3.5;
  boundaryCtx.stroke();

  const buildings = makeCanvas(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  const buildingCtx = context(buildings);
  for (const point of structures()) {
    const p = toPx(point);
    buildingCtx.fillStyle = "#f7f1e3";
    buildingCtx.strokeStyle = PAINT.ink;
    buildingCtx.lineWidth = 1.5;
    buildingCtx.fillRect(p.x - 4, p.y - 4, 8, 8);
    buildingCtx.strokeRect(p.x - 4, p.y - 4, 8, 8);
  }

  // Burn severity: a sequential ramp, light (low) to dark (high), masked to the final area.
  const severitySmall = makeCanvas(width, height);
  const severityData = context(severitySmall).createImageData(width, height);
  const ramp = PAINT.severity.map((hex) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)));
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++) {
      const x = (column + 0.5) * grid.spacing;
      const y = WORLD_DEPTH - (row + 0.5) * grid.spacing;
      const value = Math.min(0.999, Math.max(0, 0.15 + 0.95 * fbm(x * 1.4, y * 1.4, 4, 61) - 0.1));
      const scaled = value * (ramp.length - 1);
      const low = Math.floor(scaled);
      const rgb = mixRgb(ramp[low] as Rgb, ramp[low + 1] as Rgb, scaled - low);
      const index = (row * width + column) * 4;
      severityData.data[index] = rgb[0];
      severityData.data[index + 1] = rgb[1];
      severityData.data[index + 2] = rgb[2];
      severityData.data[index + 3] = 235;
    }
  context(severitySmall).putImageData(severityData, 0, 0);
  const severity = makeCanvas(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  context(severity).drawImage(severitySmall, 0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);

  // Ignition-area likelihood: one hue, with contour rings at 25, 50, and 75 percent.
  const ignition = makeCanvas(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  const ignitionCtx = context(ignition);
  const centre = toPx(IGNITION_POINT);
  const box = { x: Math.floor(centre.x - 160), y: Math.floor(centre.y - 140), w: 320, h: 280 };
  const ignitionData = ignitionCtx.createImageData(box.w, box.h);
  for (let row = 0; row < box.h; row++)
    for (let column = 0; column < box.w; column++) {
      const x = (box.x + column) / PX;
      const y = WORLD_DEPTH - (box.y + row) / PX;
      const value = ignitionLikelihood(x, y);
      const ring = [0.25, 0.5, 0.75].some((level) => Math.abs(value - level) < 0.012);
      const index = (row * box.w + column) * 4;
      ignitionData.data[index] = ring ? 72 : 123;
      ignitionData.data[index + 1] = ring ? 18 : 47;
      ignitionData.data[index + 2] = ring ? 120 : 191;
      ignitionData.data[index + 3] = ring ? 230 : Math.round(smoothstep(0.08, 1, value) * 170);
    }
  ignitionCtx.putImageData(ignitionData, box.x, box.y);

  return { color, shade, trees, water, roads, boundaries, structures: buildings, severity, ignition };
}

function arrow(ctx: CanvasRenderingContext2D, from: Point, direction: Point, lengthKm: number, fill: string, width: number) {
  const start = toPx(from);
  const dx = direction.x;
  const dy = -direction.y;
  const length = lengthKm * PX;
  const end = { x: start.x + dx * length, y: start.y + dy * length };
  const headLength = Math.min(length * 0.45, width * 3.4);
  const base = { x: end.x - dx * headLength, y: end.y - dy * headLength };
  const nx = -dy;
  const ny = dx;
  ctx.beginPath();
  ctx.moveTo(start.x + nx * width * 0.5, start.y + ny * width * 0.5);
  ctx.lineTo(base.x + nx * width * 0.5, base.y + ny * width * 0.5);
  ctx.lineTo(base.x + nx * width * 1.5, base.y + ny * width * 1.5);
  ctx.lineTo(end.x, end.y);
  ctx.lineTo(base.x - nx * width * 1.5, base.y - ny * width * 1.5);
  ctx.lineTo(base.x - nx * width * 0.5, base.y - ny * width * 0.5);
  ctx.lineTo(start.x - nx * width * 0.5, start.y - ny * width * 0.5);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = PAINT.ink;
  ctx.stroke();
}

export interface Painter {
  canvas: HTMLCanvasElement;
  paint(time: number, layers: LayerSettings): void;
}

export function createPainter(): Painter {
  const canvas = makeCanvas(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  const ctx = context(canvas);
  const base = makeCanvas(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  const baseCtx = context(base);
  let layersCache: StaticLayers | null = null;
  let baseKey = "";
  const finalPath = new Path2D();
  const finalPerimeter = perimeterAt(CONTAINED_AT);
  if (finalPerimeter) polygonPath(finalPath, finalPerimeter);

  const statics = () => {
    if (!layersCache) {
      layersCache = buildStaticLayers();
      const severityCtx = context(layersCache.severity);
      severityCtx.globalCompositeOperation = "destination-in";
      const spot = spotFireAt(CONTAINED_AT);
      const mask = new Path2D(finalPath);
      if (spot) polygonPath(mask, spot);
      severityCtx.fill(mask);
    }
    return layersCache;
  };

  const paintBase = (layers: LayerSettings) => {
    const { terrain, landcover } = layers;
    const key = `${terrain.visible}:${terrain.opacity}:${landcover.visible}:${landcover.opacity}`;
    if (key === baseKey) return;
    baseKey = key;
    const s = statics();
    baseCtx.globalCompositeOperation = "source-over";
    baseCtx.globalAlpha = 1;
    baseCtx.fillStyle = PAINT.paper;
    baseCtx.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
    baseCtx.imageSmoothingEnabled = true;
    baseCtx.imageSmoothingQuality = "high";
    if (landcover.visible) {
      baseCtx.globalAlpha = landcover.opacity;
      baseCtx.drawImage(s.color, 0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
      baseCtx.drawImage(s.trees, 0, 0);
    }
    if (terrain.visible) {
      baseCtx.globalCompositeOperation = "soft-light";
      baseCtx.globalAlpha = terrain.opacity;
      baseCtx.drawImage(s.shade, 0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
      baseCtx.globalAlpha = terrain.opacity * 0.6;
      baseCtx.drawImage(s.shade, 0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
      baseCtx.globalCompositeOperation = "source-over";
    }
    baseCtx.globalAlpha = 1;
    baseCtx.drawImage(s.water, 0, 0);
  };

  const paint = (time: number, layers: LayerSettings) => {
    paintBase(layers);
    const s = statics();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.drawImage(base, 0, 0);

    const main = perimeterAt(time);
    const spot = spotFireAt(time);
    const burnt = new Path2D();
    if (main) polygonPath(burnt, main);
    if (spot) polygonPath(burnt, spot);

    if (layers.burn.visible && (main || spot)) {
      ctx.save();
      ctx.clip(burnt, "nonzero");
      ctx.globalAlpha = layers.burn.opacity;
      ctx.drawImage(s.severity, 0, 0);
      ctx.restore();
    }
    if (layers.ignition.visible) {
      ctx.globalAlpha = layers.ignition.opacity;
      ctx.drawImage(s.ignition, 0, 0);
    }
    for (const id of ["roads", "boundaries", "structures"] as const)
      if (layers[id].visible) {
        ctx.globalAlpha = layers[id].opacity;
        ctx.drawImage(s[id], 0, 0);
      }
    ctx.globalAlpha = 1;

    if (layers.suppression.visible) {
      ctx.globalAlpha = layers.suppression.opacity;
      const line = firebreak();
      const progress = Math.min(1, Math.max(0, (time - FIREBREAK_START) / (FIREBREAK_DONE - FIREBREAK_START)));
      if (progress > 0) {
        const built = line.slice(0, Math.max(2, Math.ceil(line.length * progress)));
        linePath(ctx, built);
        ctx.strokeStyle = "rgba(255, 246, 220, 0.9)";
        ctx.lineWidth = 11;
        ctx.stroke();
        ctx.setLineDash([16, 8]);
        ctx.strokeStyle = PAINT.firebreak;
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      for (const drop of waterDrops()) {
        if (drop.at > time) continue;
        const p = toPx(drop.point);
        const fresh = time - drop.at < 3 * HOUR;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 20, 13, -0.6, 0, Math.PI * 2);
        ctx.fillStyle = fresh ? "rgba(47, 127, 191, 0.55)" : "rgba(47, 127, 191, 0.25)";
        ctx.fill();
        ctx.strokeStyle = PAINT.drop;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    if (layers.spread.visible && main) {
      ctx.globalAlpha = layers.spread.opacity;
      // Earlier modelled perimeters as faint isochrones.
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255, 246, 220, 0.5)";
      for (const at of ISOCHRONES) {
        if (at >= time) break;
        const earlier = perimeterAt(at);
        if (!earlier) continue;
        const path = new Path2D();
        polygonPath(path, earlier);
        ctx.stroke(path);
      }

      // Active front: perimeter parts that were not burnt three hours earlier.
      if (time < CONTAINED_AT) {
        const earlier = perimeterAt(time - 3 * HOUR);
        const runs: Point[][] = [];
        let run: Point[] = [];
        for (const point of main) {
          if (!earlier || !pointInPolygon(point, earlier)) run.push(point);
          else if (run.length) {
            runs.push(run);
            run = [];
          }
        }
        if (run.length) runs.push(run);
        ctx.save();
        ctx.clip(burnt, "nonzero");
        for (const [width, style] of [
          [52, "rgba(216, 31, 92, 0.28)"],
          [22, "rgba(232, 48, 96, 0.7)"],
          [7, "rgba(255, 214, 196, 0.95)"],
        ] as const) {
          ctx.lineWidth = width;
          ctx.strokeStyle = style;
          for (const part of runs) {
            linePath(ctx, part);
            ctx.stroke();
          }
          if (spot && time < SPOT_MERGED_AT) {
            const path = new Path2D();
            polygonPath(path, spot);
            ctx.stroke(path);
          }
        }
        ctx.restore();
      }

      // Modelled perimeter outline.
      ctx.setLineDash([14, 10]);
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgba(38, 32, 26, 0.75)";
      ctx.stroke(burnt);
      ctx.lineWidth = 3;
      ctx.strokeStyle = PAINT.path;
      ctx.stroke(burnt);
      ctx.setLineDash([]);

      // Head path: future part dashed, travelled part solid.
      const head = headDistance(time);
      const path = headPath();
      linePath(ctx, path);
      ctx.setLineDash([12, 12]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255, 246, 220, 0.6)";
      ctx.stroke();
      ctx.setLineDash([]);
      const travelled: Point[] = [];
      for (let s2 = 0; s2 < head; s2 += 0.05) travelled.push(alongPath(s2).point);
      travelled.push(alongPath(head).point);
      linePath(ctx, travelled);
      ctx.lineWidth = 9;
      ctx.strokeStyle = PAINT.ink;
      ctx.stroke();
      ctx.lineWidth = 5;
      ctx.strokeStyle = PAINT.path;
      ctx.stroke();

      // Spread vectors, scaled by the modelled rate.
      const rate = rateOfSpread(time);
      if (rate > 40) {
        const { point, tangent } = alongPath(head);
        const length = 0.25 + (rate / 600) * 0.75;
        arrow(ctx, point, tangent, length, PAINT.front, 9);
        for (const side of [1, -1]) {
          const flank = alongPath(head * 0.62);
          const normal = { x: -flank.tangent.y * side, y: flank.tangent.x * side };
          const direction = { x: normal.x * 0.8 + flank.tangent.x * 0.6, y: normal.y * 0.8 + flank.tangent.y * 0.6 };
          arrow(ctx, flank.point, direction, length * 0.55, PAINT.front, 7);
        }
      }
      ctx.globalAlpha = 1;
    }

    if (layers.wind.visible) {
      const weather = weatherAt(time);
      ctx.globalAlpha = layers.wind.opacity;
      for (let x = 0.9; x < WORLD_WIDTH; x += 1.75)
        for (let y = 0.9; y < WORLD_DEPTH; y += 1.75) {
          const toward = ((weather.windFrom + 180 + 12 * Math.sin(x * 0.7 + y * 0.4)) * Math.PI) / 180;
          const direction = { x: Math.sin(toward), y: Math.cos(toward) };
          arrow(ctx, { x, y }, direction, 0.25 + weather.windKmh / 45, "rgba(214, 233, 246, 0.95)", 5);
        }
      ctx.globalAlpha = 1;
    }

    if (layers.detections.visible) {
      ctx.globalAlpha = layers.detections.opacity;
      for (const detection of sceneDetections()) {
        if (detection.at > time) continue;
        const recent = time - detection.at < 12 * HOUR;
        const p = toPx(detection.point);
        ctx.globalAlpha = layers.detections.opacity * (recent ? 1 : 0.4);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
        if (detection.confidence !== "rendah") {
          ctx.fillStyle = PAINT.detectFill;
          ctx.fill();
          ctx.setLineDash([]);
        } else ctx.setLineDash([5, 4]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = PAINT.detectStroke;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;
    }
  };

  return { canvas, paint };
}
