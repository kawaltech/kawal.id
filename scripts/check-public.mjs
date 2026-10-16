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

for (const path of ["/rancangan/b", "/rancangan/b/", "/rancangan/b.data"]) {
  const response = await fetch(new URL(path, base));
  assert.equal(response.status, 200, path);
  assert.equal(
    response.headers.get("cache-control"),
    "public, max-age=300, stale-if-error=86400",
    path,
  );
  const body = await response.text();
  assert.doesNotMatch(body, /laporan-contoh-/, `${path} must not export field reports`);
  if (path.endsWith(".data")) assert.doesNotMatch(body, /"reports"/, path);
}

for (const path of ["/rancangan/a", "/rancangan/a.data", "/rancangan/c", "/rancangan/c.data"]) {
  const response = await fetch(new URL(path, base));
  assert.equal(response.status, 200, path);
  assert.equal(
    response.headers.get("cache-control"),
    "public, max-age=60, s-maxage=60, must-revalidate",
    path,
  );
  assert.match(await response.text(), /laporan-contoh-/, `${path} must retain its report fixtures`);
}

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

for (const path of ["/missing-public-route", "/rancangan/b-unlisted"]) {
  const missing = await fetch(new URL(path, base));
  assert.equal(missing.status, 404, "A missing route must not return the application shell");
  assert.equal(
    missing.headers.get("cache-control"),
    "public, max-age=60, s-maxage=60, must-revalidate",
    path,
  );
  await missing.text();
}
console.log(
  "Public HTTP checks passed: cache classes, report isolation, private paths, and no SPA fallback",
);
