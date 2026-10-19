// Test-only GeoTIFF writer for synthetic DEM tiles. It writes the layout that
// scripts/seed/geotiff.ts reads: one tiled Float32 band with geographic tags.
import { deflateSync } from "node:zlib";

interface Entry {
  tag: number;
  type: 3 | 4 | 12;
  values: number[];
}

const SIZE = { 3: 2, 4: 4, 12: 8 } as const;

function predict(row: Uint8Array, samples: number): Uint8Array {
  const planes = new Uint8Array(row.length);
  for (let sample = 0; sample < samples; sample++) {
    for (let byte = 0; byte < 4; byte++)
      planes[(3 - byte) * samples + sample] = row[sample * 4 + byte];
  }
  for (let i = planes.length - 1; i > 0; i--) planes[i] = (planes[i] - planes[i - 1]) & 0xff;
  return planes;
}

export function encodeGeoTiff(options: {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  /** Float32 samples, or UInt8 classes (written without a predictor). */
  values: Float32Array | Uint8Array;
  west: number;
  north: number;
  scale: number;
  compression?: 1 | 8;
  predictor?: 1 | 3;
  pixelIsPoint?: boolean;
}): Uint8Array {
  const { width, height, tileWidth, tileHeight, values, west, north, scale } = options;
  const float = values instanceof Float32Array;
  const { compression = 8, pixelIsPoint = true } = options;
  const predictor = float ? (options.predictor ?? 3) : 1;
  const across = Math.ceil(width / tileWidth);
  const down = Math.ceil(height / tileHeight);
  const tiles: Uint8Array[] = [];
  for (let ty = 0; ty < down; ty++) {
    for (let tx = 0; tx < across; tx++) {
      const tile = float
        ? new Float32Array(tileWidth * tileHeight)
        : new Uint8Array(tileWidth * tileHeight);
      for (let r = 0; r < tileHeight; r++) {
        for (let c = 0; c < tileWidth; c++) {
          const row = ty * tileHeight + r;
          const col = tx * tileWidth + c;
          if (row < height && col < width) tile[r * tileWidth + c] = values[row * width + col];
        }
      }
      const bytes = new Uint8Array(tile.buffer);
      if (predictor === 3) {
        for (let r = 0; r < tileHeight; r++) {
          const start = r * tileWidth * 4;
          bytes.set(predict(bytes.subarray(start, start + tileWidth * 4), tileWidth), start);
        }
      }
      tiles.push(compression === 8 ? new Uint8Array(deflateSync(bytes)) : bytes);
    }
  }
  const entries: Entry[] = [
    { tag: 256, type: 3, values: [width] },
    { tag: 257, type: 3, values: [height] },
    { tag: 258, type: 3, values: [float ? 32 : 8] },
    { tag: 259, type: 3, values: [compression] },
    { tag: 262, type: 3, values: [1] },
    { tag: 277, type: 3, values: [1] },
    { tag: 284, type: 3, values: [1] },
    { tag: 317, type: 3, values: [predictor] },
    { tag: 322, type: 3, values: [tileWidth] },
    { tag: 323, type: 3, values: [tileHeight] },
    { tag: 324, type: 4, values: tiles.map(() => 0) },
    { tag: 325, type: 4, values: tiles.map((tile) => tile.length) },
    { tag: 339, type: 3, values: [float ? 3 : 1] },
    { tag: 33550, type: 12, values: [scale, scale, 0] },
    { tag: 33922, type: 12, values: [0, 0, 0, west, north, 0] },
    {
      tag: 34735,
      type: 3,
      values: [1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, pixelIsPoint ? 2 : 1, 2048, 0, 1, 4326],
    },
  ];
  const ifdSize = 2 + entries.length * 12 + 4;
  let extra = 8 + ifdSize;
  const extraOffsets = entries.map(({ type, values: list }) => {
    const bytes = SIZE[type] * list.length;
    if (bytes <= 4) return -1;
    const at = extra;
    extra += bytes + (bytes % 2);
    return at;
  });
  let data = extra;
  entries[10].values = tiles.map((tile) => {
    const at = data;
    data += tile.length;
    return at;
  });
  const file = new Uint8Array(data);
  const view = new DataView(file.buffer);
  view.setUint16(0, 0x4949, false);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, entries.length, true);
  const put = (at: number, type: Entry["type"], value: number) => {
    if (type === 3) view.setUint16(at, value, true);
    else if (type === 4) view.setUint32(at, value, true);
    else view.setFloat64(at, value, true);
  };
  entries.forEach(({ tag, type, values: list }, i) => {
    const entry = 10 + i * 12;
    view.setUint16(entry, tag, true);
    view.setUint16(entry + 2, type, true);
    view.setUint32(entry + 4, list.length, true);
    const at = extraOffsets[i] < 0 ? entry + 8 : extraOffsets[i];
    if (extraOffsets[i] >= 0) view.setUint32(entry + 8, at, true);
    list.forEach((value, k) => put(at + k * SIZE[type], type, value));
  });
  view.setUint32(10 + entries.length * 12, 0, true);
  let at = extra;
  for (const tile of tiles) {
    file.set(tile, at);
    at += tile.length;
  }
  return file;
}
