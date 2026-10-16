import { cpSync, existsSync, mkdirSync, mkdtempSync, symlinkSync, rmSync } from "node:fs";
import { resolve, join, relative } from "node:path";

// Bootstrap only. Never replace an active publication during an app deployment.
const root = resolve(process.env.DATA_DIR ?? ".data", "public");
const current = join(root, "current");
mkdirSync(join(root, "releases"), { recursive: true });
if (!existsSync(current)) {
  const release = mkdtempSync(join(root, "releases", "bootstrap-"));
  try {
    cpSync(resolve("build/client"), release, { recursive: true });
    symlinkSync(relative(root, release), current);
    console.log("Initial static export is ready.");
  } catch (error) {
    rmSync(release, { recursive: true, force: true });
    if (error.code !== "EEXIST") throw error;
  }
}
