// Optional local seed: ESA WorldCover 2021 land cover over Indonesia, read as
// one overview (about 150 m) per 3-degree tile with HTTP range requests. Run
// from the repository root with Node.js 24:
//
//   node scripts/seed-landcover.ts [--out .data/seed] [--cell-arcsec 30] [--buffer-km 10]
//
// The first run reads about 15 MB from the AWS Open Data bucket. It needs no
// account or key and writes only under --out. Only the local development
// server reads the result.
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { runLandcoverSeed } from "./seed/landcover.ts";

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
  const seed = await runLandcoverSeed({
    outDir,
    cellArcSec: Number(values["cell-arcsec"]),
    bufferKm,
    concurrency: Number(values.concurrency),
    log: (message) => console.log(message),
  });
  console.log(`Wrote ${resolve(outDir, "landcover", seed.grid.file)} and its .json and .png files`);
  console.log(`Counts: ${JSON.stringify(seed.counts)}`);
  console.log("Land cover is a classification of 2021 images, not a current map.");
} catch (error) {
  console.error(`Land cover seed failed. The previous grid files are unchanged. ${String(error)}`);
  process.exit(1);
}
