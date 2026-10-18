// Optional local seed: Copernicus DEM GLO-90 tiles that touch Indonesia, and
// one national grid masked to Indonesia. Run from the repository root with
// Node.js 24:
//
//   node scripts/seed-dem.ts [--out .data/seed] [--cell-arcsec 30] [--buffer-km 10]
//
// The first run downloads about 1 GB from the AWS Open Data bucket. It needs no
// account or key and writes only under --out. No page, build, or test reads it.
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { runDemSeed } from "./seed/dem.ts";

const { values } = parseArgs({
  options: {
    out: { type: "string", default: ".data/seed" },
    "cell-arcsec": { type: "string", default: "30" },
    "buffer-km": { type: "string", default: "10" },
    concurrency: { type: "string", default: "6" },
  },
});
const outDir = resolve(values.out);
const bufferKm = Number(values["buffer-km"]);
if (!(bufferKm >= 0)) throw new Error("--buffer-km must be a number of at least 0");

try {
  const seed = await runDemSeed({
    outDir,
    cellArcSec: Number(values["cell-arcsec"]),
    bufferKm,
    concurrency: Number(values.concurrency),
    log: (message) => console.log(message),
  });
  const { grid, counts } = seed;
  console.log(`Wrote ${resolve(outDir, "dem", grid.file)} and its .json and .png files`);
  console.log(
    `Grid: ${grid.width} x ${grid.height} cells of ${grid.cellArcSec}″, ${grid.west}..${grid.east}°E, ${grid.south}..${grid.north}°N`,
  );
  console.log(`Counts: ${JSON.stringify(counts)}`);
  console.log("Surface model: in forest, a height can show the top of the canopy.");
} catch (error) {
  console.error(`DEM seed failed. The previous grid files are unchanged. ${String(error)}`);
  process.exit(1);
}
