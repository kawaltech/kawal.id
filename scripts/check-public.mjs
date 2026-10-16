import assert from "node:assert/strict";

const base = process.argv[2];
assert.ok(base, "Specify the public server URL: node scripts/check-public.mjs <url>");

const page = await fetch(new URL("/", base));
assert.equal(page.status, 200, "The public page must be available");
assert.equal(page.headers.get("cache-control"), "public, max-age=60, s-maxage=60, must-revalidate");
const html = await page.text();
const asset = html.match(/(?:src|href)="([^"]*\/assets\/[^"?]+\.js)"/)?.[1];
assert.ok(asset, "The prerendered page must reference a code asset");
const code = await fetch(new URL(asset, base));
assert.equal(code.status, 200, "The referenced code asset must exist");
assert.equal(code.headers.get("cache-control"), "public, max-age=31536000, immutable");
await code.arrayBuffer();

for (const path of [
  "/editor/healthz",
  "/auth/callback",
  "/private/originals/test.jpg",
  "/db/kawal.sqlite",
  "/.env",
]) {
  const response = await fetch(new URL(path, base));
  assert.equal(response.status, 404, `${path} must not be public`);
  assert.equal(response.headers.get("cache-control"), "private, no-store", path);
  await response.text();
}

const missing = await fetch(new URL("/missing-public-route", base));
assert.equal(missing.status, 404, "A missing route must not return the application shell");
await missing.text();
console.log("Public HTTP checks passed: page, immutable code, private paths, and no SPA fallback");
