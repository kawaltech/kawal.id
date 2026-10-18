// Optional local seed: NASA FIRMS VIIRS NRT detections over Indonesia for the
// last 7 days. Run from the repository root with Node.js 24:
//
//   node scripts/seed-firms.ts [--out .data/seed] [--buffer-km 10]
//
// It sends requests to FIRMS, needs no key, and writes only under --out.
// No page, build, or test reads the result.
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { FIRMS_SEED_FILE, runFirmsSeed } from "./seed/firms.ts";

const { values } = parseArgs({
  options: {
    out: { type: "string", default: ".data/seed" },
    "buffer-km": { type: "string", default: "10" },
  },
});
const outDir = resolve(values.out);
const bufferKm = Number(values["buffer-km"]);
if (!(bufferKm >= 0)) throw new Error("--buffer-km must be a number of at least 0");

try {
  const seed = await runFirmsSeed({ outDir, bufferKm });
  const days = new Map<string, number>();
  const confidence = new Map<string, number>();
  const satellites = new Map<string, number>();
  for (const detection of seed.detections) {
    // WIB is UTC+7.
    const day = new Date(Date.parse(detection.acquiredAt) + 7 * 3_600_000)
      .toISOString()
      .slice(0, 10);
    days.set(day, (days.get(day) ?? 0) + 1);
    confidence.set(detection.confidence, (confidence.get(detection.confidence) ?? 0) + 1);
    satellites.set(detection.satellite, (satellites.get(detection.satellite) ?? 0) + 1);
  }
  console.log(`Wrote ${resolve(outDir, FIRMS_SEED_FILE)}`);
  console.log(`Window: ${seed.windowHours} h to ${seed.windowEnd}`);
  console.log(`Rows: ${JSON.stringify(seed.counts)}`);
  console.log(`Satellites: ${JSON.stringify(Object.fromEntries(satellites))}`);
  console.log(`Confidence: ${JSON.stringify(Object.fromEntries(confidence))}`);
  console.log(
    `Detections per WIB day: ${JSON.stringify(Object.fromEntries([...days].sort(([a], [b]) => a.localeCompare(b))))}`,
  );
  console.log("A satellite detection is not a confirmed fire.");
} catch (error) {
  console.error(`FIRMS seed failed. The previous seed files are unchanged. ${String(error)}`);
  process.exit(1);
}
