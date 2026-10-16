import assert from "node:assert/strict";

const base = process.argv[2];
assert.ok(base, "Specify the public server URL: node scripts/check-public.mjs <url>");

const policy = "public, max-age=60, must-revalidate";
for (const path of ["/", "/rancangan", "/rancangan/a", "/rancangan/b", "/rancangan/c"]) {
  const page = await fetch(new URL(path, base));
  assert.equal(page.status, 200, path);
  assert.equal(page.headers.get("cache-control"), policy, path);
  const html = await page.text();
  assert.match(html, /noindex/, `${path} must remain a design review`);
  const name = path === "/" ? "index" : path.slice(1);
  const payload = await fetch(new URL(`/_void/pages/${name}.json`, base));
  assert.equal(payload.status, 200, `${path} navigation data`);
  assert.equal(payload.headers.get("cache-control"), policy, path);
  const data = await payload.json();
  assert.equal(data.errors, null, path);
  assert.ok(data.props && typeof data.props === "object", path);
  if (path === "/" || path === "/rancangan/b") {
    assert.doesNotMatch(html, /laporan-contoh-/, path);
    assert.ok(!("reports" in data.props), `${path} must not export reports`);
  } else if (path === "/rancangan/a" || path === "/rancangan/c") {
    assert.match(html, /laporan-contoh-/, `${path} must retain synthetic reports`);
    assert.equal(data.props.reports.length, 2, path);
  }
  const assets = [...html.matchAll(/(?:src|href)="([^"?]*\/assets\/[^"?]+\.(?:js|css))"/g)];
  assert.ok(
    assets.some((asset) => asset[1].endsWith(".js")),
    `${path} must load navigation code`,
  );
  for (const asset of assets) {
    const code = await fetch(new URL(asset[1], base));
    assert.equal(code.status, 200, asset[1]);
    assert.equal(code.headers.get("cache-control"), "public, max-age=31536000, immutable");
    await code.arrayBuffer();
  }
}

for (const path of [
  "/healthz",
  "/editor/healthz",
  "/auth/callback",
  "/private/originals/test.jpg",
  "/db/kawal.sqlite",
  "/backups/test",
  "/.env",
  "/.vite/manifest.json",
]) {
  const response = await fetch(new URL(path, base));
  assert.equal(response.status, 404, `${path} must not be public`);
  // /healthz is absent, rather than a private-path rule in the static server.
  assert.equal(
    response.headers.get("cache-control"),
    path === "/healthz" ? policy : "private, no-store",
    path,
  );
  await response.text();
}

for (const path of ["/missing-public-route", "/_void/pages/missing.json", "/rancangan/b.data"]) {
  const response = await fetch(new URL(path, base));
  assert.equal(response.status, 404, `${path} must not return the application shell`);
  await response.text();
}
console.log(
  "Public HTTP checks passed: 5 HTML/JSON pairs, code assets, report isolation, private paths, and no fallback",
);
