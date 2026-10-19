// Optional local seed: Natural Earth 1:10m rivers, lakes, and populated places
// in Indonesia. Run from the repository root with Node.js 24:
//
//   node scripts/seed-features.ts [--out .data/seed]
//
// It downloads about 17 MB from GitHub, needs no key, and writes only under
// --out. Only the local development server reads the result.
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { FEATURES_SEED_FILE, runFeaturesSeed } from "./seed/features.ts";

const { values } = parseArgs({ options: { out: { type: "string", default: ".data/seed" } } });
const outDir = resolve(values.out);

try {
  const seed = await runFeaturesSeed({ outDir });
  console.log(`Wrote ${resolve(outDir, FEATURES_SEED_FILE)}`);
  console.log(`Rivers: ${seed.rivers.length} lines, lakes: ${seed.lakes.length}, places: ${seed.places.length}`);
} catch (error) {
  console.error(`Features seed failed. The previous seed file is unchanged. ${String(error)}`);
  process.exit(1);
}
