// Minimal GeoTIFF reader for Copernicus DEM Cloud Optimized GeoTIFF tiles.
// It accepts only the layout that those tiles use: little-endian classic TIFF,
// one Float32 band, tiled, deflate or no compression, and predictor 1 or 3.
// Anything else is an error, not a silent guess.
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";

export interface Raster {
  width: number;
  height: number;
  /** Longitude and latitude of the first sample. See `pixelIsPoint`. */
  west: number;
  north: number;
  /** Degrees per sample in x and y. */
  scaleX: number;
  scaleY: number;
  /** True when the geographic position is the sample centre (GeoTIFF RasterPixelIsPoint). */
  pixelIsPoint: boolean;
  epsg: number | null;
  nodata: number | null;
  values: Float32Array;
}

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 11: 4, 12: 8, 16: 8 };

type Tags = Map<number, number[] | string>;

function readTags(view: DataView, offset: number): { tags: Tags; next: number } {
  const count = view.getUint16(offset, true);
  const tags: Tags = new Map();
  for (let i = 0; i < count; i++) {
    const entry = offset + 2 + i * 12;
    const tag = view.getUint16(entry, true);
    const type = view.getUint16(entry + 2, true);
    const length = view.getUint32(entry + 4, true);
    const size = TYPE_SIZE[type];
    if (!size) throw new Error(`Unsupported TIFF field type ${type} for tag ${tag}`);
    const at = size * length <= 4 ? entry + 8 : view.getUint32(entry + 8, true);
    if (at + size * length > view.byteLength)
      throw new Error(`TIFF tag ${tag} is outside the file`);
    if (type === 2) {
      const bytes = new Uint8Array(view.buffer, view.byteOffset + at, length);
      tags.set(tag, new TextDecoder("latin1").decode(bytes).replace(/\0+$/, ""));
      continue;
    }
    const values: number[] = [];
    for (let k = 0; k < length; k++) {
      const p = at + k * size;
      if (type === 1) values.push(view.getUint8(p));
      else if (type === 3) values.push(view.getUint16(p, true));
      else if (type === 4) values.push(view.getUint32(p, true));
      else if (type === 5) values.push(view.getUint32(p, true) / view.getUint32(p + 4, true));
      else if (type === 11) values.push(view.getFloat32(p, true));
      else if (type === 12) values.push(view.getFloat64(p, true));
      else values.push(Number(view.getBigUint64(p, true)));
    }
    tags.set(tag, values);
  }
  return { tags, next: view.getUint32(offset + 2 + count * 12, true) };
}

function numbers(tags: Tags, tag: number, name: string): number[] {
  const value = tags.get(tag);
  if (!Array.isArray(value) || !value.length) throw new Error(`TIFF has no ${name} (tag ${tag})`);
  return value;
}

function one(tags: Tags, tag: number, name: string, fallback?: number): number {
  if (!tags.has(tag) && fallback !== undefined) return fallback;
  return numbers(tags, tag, name)[0];
}

/** Undo the TIFF floating-point predictor (3) for one row of 32-bit samples. */
export function undoFloatPredictor(row: Uint8Array, samples: number): Uint8Array {
  for (let i = 1; i < row.length; i++) row[i] = (row[i] + row[i - 1]) & 0xff;
  const result = new Uint8Array(row.length);
  for (let sample = 0; sample < samples; sample++) {
    // Byte plane 0 holds the most significant bytes. The result is little-endian.
    for (let byte = 0; byte < 4; byte++)
      result[sample * 4 + byte] = row[(3 - byte) * samples + sample];
  }
  return result;
}

/** Read one image of a GeoTIFF file. Image 0 is full resolution; later images are overviews. */
export function readGeoTiff(file: Uint8Array, image = 0): Raster {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  assert.ok(view.byteLength >= 8, "TIFF is too short");
  assert.ok(view.getUint16(0, false) === 0x4949, "Only little-endian TIFF is supported");
  assert.ok(view.getUint16(2, true) === 42, "Only classic TIFF is supported");
  let offset = view.getUint32(4, true);
  let ifd = readTags(view, offset);
  const geo = ifd.tags;
  const fullWidth = one(geo, 256, "ImageWidth");
  const fullHeight = one(geo, 257, "ImageLength");
  for (let i = 0; i < image; i++) {
    offset = ifd.next;
    assert.ok(offset !== 0, `TIFF has no image ${image}`);
    ifd = readTags(view, offset);
  }
  const { tags } = ifd;
  const width = one(tags, 256, "ImageWidth");
  const height = one(tags, 257, "ImageLength");
  assert.ok(one(tags, 258, "BitsPerSample") === 32, "Only 32-bit samples are supported");
  assert.ok(one(tags, 339, "SampleFormat", 1) === 3, "Only floating-point samples are supported");
  assert.ok(one(tags, 277, "SamplesPerPixel", 1) === 1, "Only one band is supported");
  assert.ok(
    one(tags, 284, "PlanarConfiguration", 1) === 1,
    "Only chunky planar configuration is supported",
  );
  const compression = one(tags, 259, "Compression", 1);
  assert.ok([1, 8, 32946].includes(compression), `Unsupported TIFF compression ${compression}`);
  const predictor = one(tags, 317, "Predictor", 1);
  assert.ok(predictor === 1 || predictor === 3, `Unsupported TIFF predictor ${predictor}`);
  assert.ok(tags.has(322) && tags.has(323), "Only tiled TIFF is supported");
  const tileWidth = one(tags, 322, "TileWidth");
  const tileHeight = one(tags, 323, "TileLength");
  const offsets = numbers(tags, 324, "TileOffsets");
  const counts = numbers(tags, 325, "TileByteCounts");
  const across = Math.ceil(width / tileWidth);
  const down = Math.ceil(height / tileHeight);
  assert.ok(
    offsets.length === across * down && counts.length === offsets.length,
    "TIFF tile index is incomplete",
  );

  const scale = numbers(geo, 33550, "ModelPixelScale");
  const tie = numbers(geo, 33922, "ModelTiepoint");
  assert.ok(tie[0] === 0 && tie[1] === 0, "Only a tie point at raster (0, 0) is supported");
  const keys = geo.get(34735);
  let pixelIsPoint = false;
  let epsg: number | null = null;
  if (Array.isArray(keys)) {
    for (let k = 4; k + 3 < keys.length; k += 4) {
      if (keys[k] === 1025 && keys[k + 1] === 0) pixelIsPoint = keys[k + 3] === 2;
      if (keys[k] === 2048 && keys[k + 1] === 0) epsg = keys[k + 3];
    }
  }
  const nodataText = geo.get(42113);
  const nodata = typeof nodataText === "string" && nodataText.trim() ? Number(nodataText) : null;

  const values = new Float32Array(width * height);
  const tileBytes = tileWidth * tileHeight * 4;
  for (let ty = 0; ty < down; ty++) {
    for (let tx = 0; tx < across; tx++) {
      const index = ty * across + tx;
      assert.ok(
        offsets[index] + counts[index] <= file.byteLength,
        `TIFF tile ${index} is outside the file`,
      );
      const chunk = file.subarray(offsets[index], offsets[index] + counts[index]);
      const raw = compression === 1 ? Uint8Array.from(chunk) : new Uint8Array(inflateSync(chunk));
      assert.ok(
        raw.length === tileBytes,
        `TIFF tile ${index} has ${raw.length} bytes, not ${tileBytes}`,
      );
      const rows = Math.min(tileHeight, height - ty * tileHeight);
      const cols = Math.min(tileWidth, width - tx * tileWidth);
      for (let r = 0; r < rows; r++) {
        let row: Uint8Array = raw.subarray(r * tileWidth * 4, (r + 1) * tileWidth * 4);
        if (predictor === 3) row = undoFloatPredictor(row, tileWidth);
        const samples = new Float32Array(
          row.buffer.slice(row.byteOffset, row.byteOffset + cols * 4),
        );
        values.set(samples, (ty * tileHeight + r) * width + tx * tileWidth);
      }
    }
  }
  return {
    width,
    height,
    west: tie[3],
    north: tie[4],
    scaleX: (scale[0] * fullWidth) / width,
    scaleY: (scale[1] * fullHeight) / height,
    pixelIsPoint,
    epsg,
    nodata,
    values,
  };
}
