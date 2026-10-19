import { expect, test } from "vite-plus/test";
import { detailGrid } from "../app/design/indonesia-data.ts";
import {
  type Grid,
  type Outlines,
  inIndonesia,
  indonesiaMask,
  rasterize,
  readOutlines,
  rings,
} from "../scripts/seed/boundary.ts";
import { demGrid } from "../scripts/seed/dem.ts";

/** Cells where the mask and the `inIndonesia` point rule disagree. */
function disagreements(outlines: Outlines, grid: Grid, bufferKm: number) {
  const mask = indonesiaMask(outlines, grid, bufferKm);
  let extra = 0;
  let missing = 0;
  for (let row = 0; row < grid.height; row++) {
    const latitude = grid.north - (row + 0.5) * grid.cell;
    for (let col = 0; col < grid.width; col++) {
      const accepted = inIndonesia(
        outlines,
        grid.west + (col + 0.5) * grid.cell,
        latitude,
        bufferKm,
      );
      const marked = mask[row * grid.width + col] === 1;
      if (marked && !accepted) extra++;
      if (!marked && accepted) missing++;
    }
  }
  return { extra, missing };
}

test("leave a cropped grid empty for a polygon wholly outside it", () => {
  const grid = { west: 100, north: 2, cell: 0.5, width: 4, height: 4 };
  const outside = rings([[98, 0, 99, 0, 99, 2, 98, 2]]);
  expect([...rasterize(outside, grid)]).toEqual(Array.from({ length: 16 }, () => 0));
});

test("keep the buffer cells of a ring with no cell centre inside it", () => {
  const outlines: Outlines = {
    // A 0.1° island between the centres of a 0.5° grid.
    indonesia: rings([[100.55, 0.55, 100.65, 0.55, 100.65, 0.65, 100.55, 0.65]]),
    neighbours: [],
    source: { name: "Synthetic island", file: "test", sha256: "0".repeat(64) },
  };
  const grid = { west: 100, north: 1, cell: 0.5, width: 2, height: 2 };
  expect([...rasterize(outlines.indonesia, grid)]).toEqual([0, 0, 0, 0]);
  expect(disagreements(outlines, grid, 20)).toEqual({ extra: 0, missing: 0 });
});

test("match the point rule on the 900-second national grid", () => {
  const outlines = readOutlines();
  const { grid } = demGrid(outlines, 900, 10);
  expect(disagreements(outlines, grid, 10)).toEqual({ extra: 0, missing: 0 });
});

test("match the point rule on cropped detail patches", () => {
  const outlines = readOutlines();
  // Central Java, and the Strait of Malacca with peninsular Malaysia.
  for (const [west, north] of [
    [110, -6],
    [100, 5],
  ]) {
    expect(disagreements(outlines, detailGrid(west, north), 10)).toEqual({ extra: 0, missing: 0 });
  }
}, 60_000);
