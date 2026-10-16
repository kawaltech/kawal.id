import assert from "node:assert/strict";

// Read-only HTTP checks for the deployed editorial staging Worker.
// Usage: node scripts/check-editorial-staging.mjs <origin> <version-id> [absent-origin...]
const usage =
  "Usage: node scripts/check-editorial-staging.mjs <editorial-origin> <version-id> [absent-origin...]";
const [base, expectedVersion, ...absentOrigins] = process.argv.slice(2);
assert.ok(base && expectedVersion, usage);
assert.match(expectedVersion, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i, usage);
const origin = checkedOrigin(base);
const absent = absentOrigins.map(checkedOrigin);

function checkedOrigin(value) {
  const url = new URL(value);
  const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  assert.ok(
    url.protocol === "https:" || (local && url.protocol === "http:"),
    `${value}: use https`,
  );
  return url.origin;
}

function get(path, { from = origin, page = false } = {}) {
  const headers = page
    ? { accept: "text/html", "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" }
    : { accept: "*/*" };
  return fetch(new URL(path, from), { redirect: "manual", cache: "no-store", headers });
}

// Require no-store and reject any directive that allows shared storage or freshness.
function noStore(path, response, { requirePrivate }) {
  const policy = response.headers.get("cache-control") ?? "";
  const directives = new Map(
    policy
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
      .map((part) => part.split("=").map((item) => item.trim())),
  );
  assert.ok(directives.has("no-store"), `${path}: no-store (got "${policy}")`);
  if (requirePrivate) assert.ok(directives.has("private"), `${path}: private (got "${policy}")`);
  for (const name of ["public", "immutable", "stale-while-revalidate", "stale-if-error"]) {
    assert.ok(!directives.has(name), `${path}: ${name} is not allowed`);
  }
  for (const name of ["max-age", "s-maxage"]) {
    if (directives.has(name)) assert.equal(Number(directives.get(name)), 0, `${path}: ${name}`);
  }
}

async function editorialResponse(path, response, { requirePrivate = true } = {}) {
  noStore(path, response, { requirePrivate });
  assert.match(
    response.headers.get("x-robots-tag") ?? "",
    /\bnoindex\b/i,
    `${path}: noindex header`,
  );
  const body = await response.text();
  if ((response.headers.get("content-type") ?? "").includes("text/html")) {
    assert.match(body, /<meta name="robots" content="noindex"/, `${path}: noindex meta`);
  }
  return body;
}

function noSessionCookie(path, response) {
  assert.doesNotMatch(
    response.headers.get("set-cookie") ?? "",
    /session_token/,
    `${path}: no session`,
  );
}

const ready = await get("/__void/ready");
assert.equal(ready.status, 200, "/__void/ready: the Worker must be ready");
noStore("/__void/ready", ready, { requirePrivate: false });
assert.deepEqual(
  await ready.json(),
  { ready: true, versionId: expectedVersion },
  "/__void/ready: active versionId",
);

// Anonymous page requests go to sign-in; non-page requests get 401, not an HTML redirect.
const home = await get("/", { page: true });
assert.equal(home.status, 303, "/: anonymous page requests must get 303");
const signIn = new URL(home.headers.get("location") ?? "", origin);
assert.equal(signIn.origin, origin, "/: sign-in redirect must stay on this origin");
assert.equal(signIn.pathname, "/sign-in", "/: anonymous page requests must go to /sign-in");
noSessionCookie("/", home);
await editorialResponse("/", home);

const data = await get("/_void/pages/index.json");
assert.equal(data.status, 401, "/_void/pages/index.json: anonymous data requests must get 401");
noSessionCookie("/_void/pages/index.json", data);
await editorialResponse("/_void/pages/index.json", data);

const signInPage = await get("/sign-in", { page: true });
assert.equal(signInPage.status, 200, "/sign-in: anonymous sign-in page");
noSessionCookie("/sign-in", signInPage);
await editorialResponse("/sign-in", signInPage);

// Better Auth responses may use its own no-store policy.
const session = await get("/api/auth/get-session");
assert.equal(session.status, 200, "/api/auth/get-session: status");
const sessionBody = await editorialResponse("/api/auth/get-session", session, {
  requirePrivate: false,
});
assert.equal(
  JSON.parse(sessionBody),
  null,
  "/api/auth/get-session: anonymous session must be null",
);

// A callback without Google's code and state must fail on this origin without a session.
const callback = await get("/api/auth/callback/google");
assert.ok([302, 303].includes(callback.status), "/api/auth/callback/google: redirect status");
const location = new URL(callback.headers.get("location") ?? "", origin);
assert.equal(location.origin, origin, "/api/auth/callback/google: same origin");
noSessionCookie("/api/auth/callback/google", callback);
await editorialResponse("/api/auth/callback/google", callback, { requirePrivate: false });

// The health route stays anonymous, with minimal status only.
const health = await get("/healthz");
assert.equal(health.status, 200, "/healthz: status");
noSessionCookie("/healthz", health);
const healthBody = await editorialResponse("/healthz", health);
assert.deepEqual(JSON.parse(healthBody), { status: "ok" }, "/healthz: minimal status only");

const missing = await get("/__kawal-missing-route");
assert.ok([401, 404].includes(missing.status), "/__kawal-missing-route: no application fallback");
await editorialResponse("/__kawal-missing-route", missing);

// A network failure cannot prove that a host is disabled.
for (const host of absent) {
  let response;
  try {
    response = await get("/__void/ready", { from: host });
  } catch (error) {
    assert.fail(
      `${host}: no HTTP response; the check is inconclusive (${error.cause?.code ?? error})`,
    );
  }
  const body = await response.text();
  let ready = false;
  try {
    const value = JSON.parse(body);
    ready = value !== null && typeof value === "object" && "ready" in value;
  } catch {}
  assert.ok(
    !(response.ok && ready),
    `${host}: this host must not serve any editorial Worker version`,
  );
}

console.log(
  `Editorial staging checks passed: version ${expectedVersion}, sign-in redirect, data 401, ` +
    `null session, rejected OAuth callback, minimal health, no-store, noindex, and ${absent.length} absent host(s)`,
);
