import assert from "node:assert/strict";
import { existsSync, globSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL("../apps/public/", import.meta.url));
const output = join(root, "dist/client");
const pages = globSync("**/*.tsx", { cwd: join(root, "pages") })
  .filter((page) => basename(page) !== "layout.tsx");
assert.ok(pages.length, "The public project must have pages");

// Void 1.1.11 warns but exits successfully when a page fails to prerender.
for (const page of pages) {
  const name = page.replace(/\.tsx$/, "").replace(/(^|\/)index$/, "") || "index";
  const html = readFileSync(join(output, `${name}.html`), "utf8");
  const data = JSON.parse(readFileSync(join(output, "_void/pages", `${name}.json`), "utf8"));
  assert.match(html, /<html[\s>]/, `${name} must have generated HTML`);
  assert.equal(data.errors, null, `${name} must have successful navigation data`);
  assert.ok(data.props && typeof data.props === "object", `${name} must have page props`);
  if (name === "index" || name === "rancangan/b") {
    assert.doesNotMatch(html, /laporan-contoh-/, `${name} must not contain field reports`);
    assert.ok(!("reports" in data.props), `${name} must not export field reports`);
  }
}

for (const directory of ["routes", "middleware", "crons", "queues"]) {
  assert.ok(!existsSync(join(root, directory)), `Keep ${directory} out of the static-only public project`);
}
console.log(`Public build checks passed: ${pages.length} complete HTML/JSON pairs; no editorial routes or B reports`);
