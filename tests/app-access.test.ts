// App sign-in, session, and reviewer access checks on the built Worker.
// Every identity is synthetic. Google is replaced only by the test-only token
// stub in tests/support; outbound network access is denied otherwise.
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vite-plus/test";
import { claimInvitation, createInvitation, revokeGrant } from "../apps/app/lib/reviewer-store.ts";
import { ReviewerAccessError, authorizeReviewer } from "../apps/app/lib/reviewer-guard.ts";
import {
  APP_ORIGIN,
  CookieJar,
  GOOGLE_CALLBACK,
  GOOGLE_TOKEN_ENDPOINT,
  TEST_GOOGLE_CLIENT_ID,
  buildApp,
  completeGoogleSignIn,
  signInWithGoogle,
  startApp,
  startGoogleSignIn,
  type D1Like,
  type AppBuild,
  type AppRuntime,
  type SyntheticGoogleProfile,
} from "./support/app-runtime.ts";

const SESSION_COOKIE = "__Secure-better-auth.session_token";
const EVIL_ORIGIN = "https://evil.example";

let build: AppBuild;
const runtimes: AppRuntime[] = [];

beforeAll(async () => {
  build = await buildApp();
}, 180_000);

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()));
});

afterAll(async () => {
  await build?.dispose();
});

/** A new Worker with empty temporary D1/R2 state and native migrations applied. */
async function createApp(bindings?: Record<string, string | undefined>) {
  const runtime = await startApp(build, { bindings });
  runtimes.push(runtime);
  await runtime.migrate();
  return { app: runtime, db: await runtime.database() };
}

let identities = 0;
function profile(overrides: Partial<SyntheticGoogleProfile> = {}): SyntheticGoogleProfile {
  identities += 1;
  return {
    sub: `synthetic-google-subject-${identities}`,
    email: `reviewer-${identities}@example.test`,
    email_verified: true,
    name: `Synthetic Reviewer ${identities}`,
    ...overrides,
  };
}

/** A browser navigation to a protected page. */
function page(app: AppRuntime, path: string, jar?: CookieJar) {
  return app.fetch(path, {
    jar,
    headers: {
      accept: "text/html,application/xhtml+xml",
      "sec-fetch-mode": "navigate",
      "sec-fetch-dest": "document",
    },
  });
}

/** A native client-navigation data request for a protected page. */
function pageData(app: AppRuntime, path: string, jar?: CookieJar) {
  return app.fetch(path, { jar, headers: { "x-voidpages": "true", accept: "application/json" } });
}

function directives(response: Response) {
  return new Set(
    (response.headers.get("cache-control") ?? "")
      .split(",")
      .map((directive) => directive.trim().toLowerCase().split("=")[0]!)
      .filter(Boolean),
  );
}

/** No shared or browser storage, and no freshness that permits reuse. */
function expectNoStore(response: Response) {
  const policy = directives(response);
  expect(policy, `${response.url} Cache-Control`).toContain("no-store");
  for (const forbidden of [
    "public",
    "max-age",
    "s-maxage",
    "immutable",
    "stale-while-revalidate",
    "stale-if-error",
  ]) {
    expect(policy, `${response.url} Cache-Control`).not.toContain(forbidden);
  }
}

function expectNoindex(response: Response) {
  expect(response.headers.get("x-robots-tag") ?? "", `${response.url} X-Robots-Tag`).toMatch(
    /noindex/i,
  );
}

function setCookies(response: Response, name: string) {
  return response.headers.getSetCookie().filter((line) => line.startsWith(`${name}=`));
}

function expectRedirect(response: Response, path: string) {
  expect([302, 303]).toContain(response.status);
  const location = new URL(response.headers.get("location") ?? "", APP_ORIGIN);
  expect(location.origin).toBe(APP_ORIGIN);
  expect(location.pathname).toBe(path);
  return location;
}

/** A failed callback goes to the sign-in page with an error code and sets no session. */
function expectCallbackError(callback: Response, ...codes: string[]) {
  const location = expectRedirect(callback, "/sign-in");
  expect(codes).toContain(location.searchParams.get("error"));
  expect(setCookies(callback, SESSION_COOKIE).filter((line) => !/Max-Age=0/.test(line))).toEqual(
    [],
  );
  expectNoStore(callback);
}

async function expectJsonError(response: Response, status: 401 | 403) {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type") ?? "").toMatch(/application\/json/);
  expect(await response.json()).toEqual({
    error: status === 401 ? "unauthenticated" : "forbidden",
  });
  expectNoStore(response);
}

/** Anonymous: page GET goes to sign-in; data and other requests get 401. */
async function expectAnonymous(app: AppRuntime, jar?: CookieJar) {
  const navigation = await page(app, "/", jar);
  expectRedirect(navigation, "/sign-in");
  expectNoStore(navigation);
  await expectJsonError(await pageData(app, "/", jar), 401);
}

/** Signed in without an active grant: page GET goes to access-pending; data gets 403. */
async function expectNoAccess(app: AppRuntime, jar: CookieJar) {
  const navigation = await page(app, "/", jar);
  expectRedirect(navigation, "/access-pending");
  expectNoStore(navigation);
  await expectJsonError(await pageData(app, "/", jar), 403);
}

async function expectReviewer(app: AppRuntime, jar: CookieJar) {
  const navigation = await page(app, "/", jar);
  expect(navigation.status).toBe(200);
  expectNoStore(navigation);
  const data = await pageData(app, "/", jar);
  expect(data.status).toBe(200);
  expectNoStore(data);
}

async function count(db: D1Like, table: string, where = "1 = 1", ...values: unknown[]) {
  const row = await db
    .prepare(`SELECT count(*) AS n FROM "${table}" WHERE ${where}`)
    .bind(...values)
    .first<{ n: number }>();
  return row!.n;
}

async function userId(db: D1Like, email: string) {
  const row = await db
    .prepare(`SELECT id FROM "user" WHERE email = ?`)
    .bind(email)
    .first<{ id: string }>();
  return row?.id;
}

const local = { via: "local" } as const;

function invite(db: D1Like, email: string, role: "reviewer" | "admin" = "reviewer") {
  return createInvitation(db as never, { email, role, source: local });
}

/** Invite a synthetic reviewer, sign in through Google, and claim on first request. */
async function reviewer(
  app: AppRuntime,
  db: D1Like,
  identity = profile(),
  role: "reviewer" | "admin" = "reviewer",
) {
  await invite(db, identity.email, role);
  const { callback, jar } = await signInWithGoogle(app, identity);
  expectRedirect(callback, "/");
  await expectReviewer(app, jar);
  return { identity, jar, id: (await userId(db, identity.email))! };
}

/** Set a stored session expiry relative to now, keeping the stored column type. */
async function setSessionExpiry(db: D1Like, user: string, offset: number) {
  const row = await db
    .prepare(`SELECT typeof(expiresAt) AS type FROM "session" WHERE userId = ?`)
    .bind(user)
    .first<{ type: string }>();
  const at = Date.now() + offset;
  await db
    .prepare(`UPDATE "session" SET expiresAt = ? WHERE userId = ?`)
    .bind(row?.type === "integer" ? at : new Date(at).toISOString(), user)
    .run();
}

describe("test harness controls", () => {
  test("native migration routes reject a missing or wrong internal token", async () => {
    const { app, db } = await createApp();
    const before = await count(db, "_void_migrations");
    for (const headers of [{}, { "x-void-internal": "wrong-token" }] as HeadersInit[]) {
      for (const [method, path] of [
        ["POST", "/__void/migrate"],
        ["POST", "/__void/migrate/auth"],
        ["POST", "/__void/migrate/app"],
        ["GET", "/__void/migrate/capabilities"],
      ] as const) {
        const response = await app.fetch(path, { method, headers });
        expect([401, 403], `${method} ${path}`).toContain(response.status);
        expect(await response.text(), `${method} ${path}`).not.toMatch(/"ok":\s*true/);
      }
    }
    expect(await count(db, "_void_migrations")).toBe(before);
    // Positive control: the random token of this runtime is accepted.
    await expect(app.migrate()).resolves.toMatchObject({ ok: true });
  });

  test("the Worker under test is a production build", async () => {
    const { app } = await createApp();
    // A development build lets source modules through the access middleware.
    for (const path of ["/pages/index.tsx", "/middleware/01.app-access.ts", "/auth.ts"]) {
      await expectJsonError(await app.fetch(path), 401);
    }
  });

  test("other internal paths do not expose data or bypass access", async () => {
    const { app } = await createApp();
    const ready = await app.fetch("/__void/ready");
    expect(ready.status).toBe(200);
    const readiness = (await ready.json()) as Record<string, unknown>;
    expect(readiness.ready).toBe(true);
    expect(Object.keys(readiness).filter((key) => key !== "ready" && key !== "versionId")).toEqual(
      [],
    );
    const discovery = await app.fetch("/__void/prerender-paths", { method: "POST" });
    expect(discovery.status).not.toBe(200);
    for (const path of ["/__void/kawal-probe", "/__kawal-probe", "/_void/pages/index.json"]) {
      const response = await app.fetch(path);
      expect(response.status, path).not.toBe(200);
      expect(await response.text(), path).not.toMatch(/"props"/);
    }
  });

  test("with default outbound denial, no token response can create a session", async () => {
    const { app, db } = await createApp();
    const authorization = await startGoogleSignIn(app);
    expectCallbackError(await completeGoogleSignIn(app, authorization), "invalid_code");
    expect(await count(db, "session")).toBe(0);
    expect(await count(db, "user")).toBe(0);
    // Only the token endpoint was attempted, and the harness denied it.
    expect(app.outbound.requests).toEqual([{ method: "POST", url: GOOGLE_TOKEN_ENDPOINT }]);
    await expectAnonymous(app, authorization.jar);
  });

  test("the token stub rejects an exchange with the wrong PKCE challenge", async () => {
    const { app, db } = await createApp();
    const authorization = await startGoogleSignIn(app);
    const callback = await completeGoogleSignIn(
      app,
      { ...authorization, codeChallenge: "not-the-issued-challenge" },
      profile(),
    );
    expectCallbackError(callback, "invalid_code");
    expect(await count(db, "session")).toBe(0);
  });
});

describe("Google-only configuration", () => {
  test("the authorization request uses the fixed app callback, state, and S256 PKCE", async () => {
    const { app } = await createApp();
    // Start on another host: the callback must still be the configured app origin.
    const response = await app.fetch(
      "https://kawal-asap-app.example.workers.dev/api/auth/sign-in/social",
      {
        method: "POST",
        origin: APP_ORIGIN,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "google", callbackURL: "/" }),
      },
    );
    expect(response.status).toBe(200);
    expectNoStore(response);
    const url = new URL(((await response.json()) as { url: string }).url);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe(TEST_GOOGLE_CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(GOOGLE_CALLBACK);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[\w-]{43}$/);
    expect(url.searchParams.get("state")).toMatch(/^[\w-]{16,}$/);
    expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual([
      "email",
      "openid",
      "profile",
    ]);
    expect(url.searchParams.get("prompt")).toBe("select_account");
  });

  test("password, linking, ID-token, and test identity paths are unavailable", async () => {
    const { app, db } = await createApp();
    const { jar } = await reviewer(app, db);
    const body = JSON.stringify({
      email: "synthetic@example.test",
      password: "synthetic-password-123",
      name: "Synthetic",
      provider: "google",
      callbackURL: "/",
      subject: "synthetic-subject",
    });
    for (const path of [
      "/api/auth/sign-in/email",
      "/api/auth/sign-up/email",
      "/api/auth/link-social",
      "/api/auth/unlink-account",
      "/api/auth/change-email",
      "/api/auth/change-password",
      "/api/auth/set-password",
      "/api/auth/request-password-reset",
      "/api/auth/reset-password",
      "/api/auth/update-user",
      "/api/auth/delete-user",
      "/api/auth/test/sign-in",
    ]) {
      for (const cookies of [undefined, jar]) {
        const response = await app.fetch(path, {
          method: "POST",
          jar: cookies?.clone(),
          origin: APP_ORIGIN,
          headers: { "content-type": "application/json" },
          body,
        });
        expect(response.status, path).toBe(404);
      }
    }
    const idToken = await app.fetch("/api/auth/sign-in/social", {
      method: "POST",
      origin: APP_ORIGIN,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", idToken: { token: "a.b.c" } }),
    });
    expect(idToken.status).toBeGreaterThanOrEqual(400);
    expect(idToken.status).toBeLessThan(500);
    expect(await count(db, "user")).toBe(1);
    expect(await count(db, "account", "providerId <> 'google'")).toBe(0);
  });

  test("other providers are not configured", async () => {
    const { app } = await createApp();
    for (const provider of ["github", "apple", "microsoft", "credential"]) {
      const response = await app.fetch("/api/auth/sign-in/social", {
        method: "POST",
        origin: APP_ORIGIN,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, callbackURL: "/" }),
      });
      expect(response.status, provider).toBeGreaterThanOrEqual(400);
      expect(response.status, provider).toBeLessThan(500);
    }
  });

  test.each([
    [
      "no client credentials",
      { AUTH_GOOGLE_CLIENT_ID: undefined, AUTH_GOOGLE_CLIENT_SECRET: undefined },
    ],
    ["no app origin", { AUTH_BASE_URL: undefined }],
    ["an http app origin", { AUTH_BASE_URL: "http://app.kawal.id" }],
  ])("Google sign-in fails closed with %s, and health stays available", async (_, bindings) => {
    const { app } = await createApp(bindings);
    const response = await app.fetch("/api/auth/sign-in/social", {
      method: "POST",
      origin: APP_ORIGIN,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: "/" }),
    });
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("accounts.google.com");
    const health = await app.fetch("/healthz");
    expect(health.status).toBe(200);
    expectNoStore(health);
    // Protected requests stay denied in this partial configuration.
    await expectAnonymous(app);
  });

  test("a build without the auth secret serves no protected content", async () => {
    const app = await startApp(build, { bindings: { BETTER_AUTH_SECRET: undefined } });
    runtimes.push(app);
    for (const response of [await page(app, "/"), await pageData(app, "/")]) {
      expect(response.status).not.toBe(200);
      expect(response.status).not.toBe(304);
    }
  });

  test("health is anonymous, minimal, no-store, and noindex", async () => {
    const { app } = await createApp();
    const health = await app.fetch("/healthz");
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok" });
    expectNoStore(health);
    expect(directives(health)).toContain("private");
    expectNoindex(health);
    expect(health.headers.getSetCookie()).toEqual([]);
  });

  test("the session cookie is host-only, secure, HTTP-only, and lax", async () => {
    const { app, db } = await createApp();
    await invite(db, "cookie@example.test");
    const { callback } = await signInWithGoogle(app, profile({ email: "cookie@example.test" }));
    const [cookie] = setCookies(callback, SESSION_COOKIE);
    expect(cookie).toBeDefined();
    const attributes = cookie!.split(";").map((part) => part.trim().toLowerCase());
    expect(attributes).toEqual(
      expect.arrayContaining(["secure", "httponly", "samesite=lax", "path=/"]),
    );
    expect(attributes.some((part) => part.startsWith("domain="))).toBe(false);
    expect(attributes).toContain("max-age=43200");
    // Session cookie caching is off: no cached session data cookie is issued.
    expect(
      callback.headers.getSetCookie().filter((line) => /session_data=[^;]/.test(line)),
    ).toEqual([]);
  });
});

describe("callback protections", () => {
  test("a callback without the issued state cookie creates no session", async () => {
    const { app, db } = await createApp();
    const authorization = await startGoogleSignIn(app);
    // Another browser presents a valid state value but not its cookie.
    expectCallbackError(
      await completeGoogleSignIn(app, authorization, profile(), { jar: new CookieJar() }),
      "state_mismatch",
    );
    // A forged state value.
    expectCallbackError(
      await completeGoogleSignIn(app, authorization, profile(), { state: "forged-state-value" }),
      "state_mismatch",
    );
    // No state.
    expectCallbackError(
      await app.fetch("/api/auth/callback/google?code=synthetic", {
        jar: authorization.jar.clone(),
      }),
      "state_mismatch",
      "state_not_found",
    );
    expect(await count(db, "session")).toBe(0);
  });

  test("a state is single use", async () => {
    const { app, db } = await createApp();
    const identity = profile();
    await invite(db, identity.email);
    const authorization = await startGoogleSignIn(app);
    const replayJar = authorization.jar.clone();
    expectRedirect(await completeGoogleSignIn(app, authorization, identity), "/");
    const replay = await completeGoogleSignIn(app, { ...authorization, jar: replayJar }, identity);
    expectCallbackError(replay, "state_mismatch");
    expect(await count(db, "session")).toBe(1);
  });

  test("sign-in rejects a callback URL on another origin", async () => {
    const { app } = await createApp();
    for (const callbackURL of [
      `${EVIL_ORIGIN}/`,
      "//evil.example/",
      "https://kawal.id.evil.example/",
    ]) {
      const response = await app.fetch("/api/auth/sign-in/social", {
        method: "POST",
        origin: APP_ORIGIN,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "google", callbackURL }),
      });
      expect(response.status, callbackURL).toBe(403);
      expect(response.headers.getSetCookie().join(";")).not.toContain("better-auth.state=");
    }
  });
});

describe("verified invitation claims", () => {
  test("an unverified Google email is rejected on the first sign-in", async () => {
    const { app, db } = await createApp();
    const identity = profile({ email_verified: false });
    await invite(db, identity.email);
    const { callback, jar } = await signInWithGoogle(app, identity);
    expectCallbackError(callback, "email_not_verified");
    expect(setCookies(callback, SESSION_COOKIE).filter((line) => !/Max-Age=0/.test(line))).toEqual(
      [],
    );
    expect(await count(db, "user")).toBe(0);
    expect(await count(db, "account")).toBe(0);
    expect(await count(db, "session")).toBe(0);
    expect(await count(db, "reviewer_grants")).toBe(0);
    expect(await count(db, "reviewer_invitations", "claimed_at IS NOT NULL")).toBe(0);
    await expectAnonymous(app, jar);
  });

  test("an unverified Google email is rejected on a returning sign-in", async () => {
    const { app, db } = await createApp();
    const { identity, jar, id } = await reviewer(app, db);
    // Positive control above: the verified sign-in worked. Sign out, then return unverified.
    await app.fetch("/api/auth/sign-out", {
      method: "POST",
      jar,
      origin: APP_ORIGIN,
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const returning = await signInWithGoogle(app, { ...identity, email_verified: false });
    expectCallbackError(returning.callback, "email_not_verified");
    expect(
      setCookies(returning.callback, SESSION_COOKIE).filter((line) => !/Max-Age=0/.test(line)),
    ).toEqual([]);
    expect(await count(db, "session", "userId = ?", id)).toBe(0);
    await expectAnonymous(app, returning.jar);
  });

  test("a verified Google user without an invitation is signed in but has no access", async () => {
    const { app, db } = await createApp();
    const identity = profile();
    const { callback, jar } = await signInWithGoogle(app, identity);
    expectRedirect(callback, "/");
    const id = await userId(db, identity.email);
    expect(id).toBeDefined();
    expect(
      await count(
        db,
        "account",
        "userId = ? AND providerId = 'google' AND accountId = ?",
        id,
        identity.sub,
      ),
    ).toBe(1);
    await expectNoAccess(app, jar);
    expect(await count(db, "reviewer_grants")).toBe(0);
  });

  test("an invited reviewer claims once, bound to the native user and Google subject", async () => {
    const { app, db } = await createApp();
    const identity = profile({ email: "Invited.Reviewer@Example.test" });
    await invite(db, identity.email);
    // Google returns the same address in another case; the claim still matches.
    const { jar, callback } = await signInWithGoogle(app, {
      ...identity,
      email: identity.email.toLowerCase(),
    });
    expectRedirect(callback, "/");
    await expectReviewer(app, jar);
    const id = (await userId(db, identity.email.toLowerCase()))!;
    expect(
      await count(
        db,
        "reviewer_grants",
        "user_id = ? AND google_subject = ? AND revoked_at IS NULL",
        id,
        identity.sub,
      ),
    ).toBe(1);
    expect(
      await count(
        db,
        "reviewer_invitations",
        "claimed_by_user_id = ? AND claimed_google_subject = ? AND claimed_at IS NOT NULL",
        id,
        identity.sub,
      ),
    ).toBe(1);
  });

  test("concurrent first requests claim an invitation exactly once", async () => {
    const { app, db } = await createApp();
    const identity = profile();
    await invite(db, identity.email);
    const { jar } = await signInWithGoogle(app, identity);
    const responses = await Promise.all(Array.from({ length: 8 }, () => pageData(app, "/", jar)));
    expect(responses.map((response) => response.status)).toEqual(Array(8).fill(200));
    expect(await count(db, "reviewer_grants")).toBe(1);
    expect(await count(db, "reviewer_invitations", "claimed_at IS NOT NULL")).toBe(1);
  });

  test("different identities racing for one invitation produce one grant", async () => {
    const { db } = await createApp();
    const email = "race@example.test";
    const invitation = await invite(db, email);
    // Linking is off, so only the store can see several subjects for one email.
    const outcomes = await Promise.allSettled(
      Array.from({ length: 6 }, (_, index) =>
        claimInvitation(db as never, {
          userId: `synthetic-race-user-${index}`,
          googleSubject: `synthetic-race-subject-${index}`,
          email,
          sessionId: `synthetic-race-session-${index}`,
        }),
      ),
    );
    const won = outcomes.filter((outcome) => outcome.status === "fulfilled" && outcome.value);
    expect(won).toHaveLength(1);
    expect(await count(db, "reviewer_grants", "invitation_id = ?", invitation.id)).toBe(1);
    expect(await count(db, "reviewer_grants")).toBe(1);
    expect(await count(db, "reviewer_invitations", "claimed_at IS NOT NULL")).toBe(1);
  });

  test("a reviewer grant does not satisfy the admin role", async () => {
    const { app, db } = await createApp();
    const { identity, id } = await reviewer(app, db);
    const session = await db
      .prepare(`SELECT id FROM "session" WHERE userId = ?`)
      .bind(id)
      .first<{ id: string }>();
    const reviewerIdentity = {
      userId: id,
      googleSubject: identity.sub,
      email: identity.email,
      sessionId: session!.id,
    };
    // Positive control: the same identity passes the default reviewer role.
    await expect(authorizeReviewer(db as never, reviewerIdentity)).resolves.toBeDefined();
    const denied = await authorizeReviewer(db as never, reviewerIdentity, { role: "admin" }).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(denied).toBeInstanceOf(ReviewerAccessError);
    expect(denied).toMatchObject({ status: 403, reason: "role" });
  });

  test("bootstrap creates at most one open admin invitation, also under concurrency", async () => {
    const { db } = await createApp();
    const bootstrap = (index: number) =>
      createInvitation(db as never, {
        email: `bootstrap-${index}@example.test`,
        role: "admin",
        source: { via: "bootstrap" },
      }).catch(() => ({ created: false }));
    const results = await Promise.all(Array.from({ length: 6 }, (_, index) => bootstrap(index)));
    expect(results.filter((result) => result.created)).toHaveLength(1);
    // Repeat while the first admin invitation is still pending and no admin is active.
    expect((await bootstrap(99)).created).toBe(false);
    expect(
      await count(db, "reviewer_invitations", "created_via = 'bootstrap' AND revoked_at IS NULL"),
    ).toBe(1);
  });

  test("a bootstrap invitation cannot be claimed while an active admin exists", async () => {
    const { app, db } = await createApp();
    const pending = profile();
    const created = await createInvitation(db as never, {
      email: pending.email,
      role: "admin",
      source: { via: "bootstrap" },
    });
    expect(created.created).toBe(true);
    const admin = profile();
    await invite(db, admin.email, "admin");
    const { jar } = await signInWithGoogle(app, admin);
    await expectReviewer(app, jar);
    expect(await count(db, "reviewer_grants", "role = 'admin' AND revoked_at IS NULL")).toBe(1);
    const late = await signInWithGoogle(app, pending);
    await expectNoAccess(app, late.jar);
    expect(await count(db, "reviewer_grants", "role = 'admin' AND revoked_at IS NULL")).toBe(1);
  });

  test("a changed verified Google email keeps the subject's grant and claims nothing new", async () => {
    const { app, db } = await createApp();
    const { identity, jar, id } = await reviewer(app, db);
    await app.fetch("/api/auth/sign-out", {
      method: "POST",
      jar,
      origin: APP_ORIGIN,
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const changed = `changed-${identity.email}`;
    const returning = await signInWithGoogle(app, { ...identity, email: changed });
    expectRedirect(returning.callback, "/");
    expect(await userId(db, changed)).toBe(id);
    expect(await userId(db, identity.email)).toBeUndefined();
    await expectReviewer(app, returning.jar);
    // An invitation to the old address is not claimed by the same person again.
    await invite(db, identity.email);
    await expectReviewer(app, returning.jar);
    expect(await count(db, "reviewer_grants", "user_id = ?", id)).toBe(1);
    expect(
      await count(db, "reviewer_invitations", "email = ? AND claimed_at IS NULL", identity.email),
    ).toBe(1);
  });

  test("a returning sign-in with another user's email is rejected", async () => {
    const { app, db } = await createApp();
    const first = await reviewer(app, db);
    const second = await reviewer(app, db);
    await app.fetch("/api/auth/sign-out", {
      method: "POST",
      jar: second.jar,
      origin: APP_ORIGIN,
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const collision = await signInWithGoogle(app, {
      ...second.identity,
      email: first.identity.email,
    });
    expectCallbackError(collision.callback, "email_in_use");
    expect(await count(db, "session", "userId = ?", second.id)).toBe(0);
    expect(await userId(db, second.identity.email)).toBe(second.id);
    expect(await userId(db, first.identity.email)).toBe(first.id);
    await expectAnonymous(app, collision.jar);
    // Control: the first user keeps access.
    await expectReviewer(app, first.jar);
  });

  test("a second Google subject with the invited email cannot sign in or claim", async () => {
    const { app, db } = await createApp();
    const { identity } = await reviewer(app, db);
    const other = await signInWithGoogle(app, { ...identity, sub: `${identity.sub}-other` });
    expectCallbackError(other.callback, "account_not_linked");
    expect(await count(db, "account")).toBe(1);
    expect(await count(db, "reviewer_grants")).toBe(1);
    await expectAnonymous(app, other.jar);
  });

  test("expired and revoked invitations give no access", async () => {
    const { app, db } = await createApp();
    const expired = profile();
    const revoked = profile();
    await invite(db, expired.email);
    await invite(db, revoked.email);
    await db
      .prepare(`UPDATE reviewer_invitations SET expires_at = ? WHERE email = ?`)
      .bind(new Date(Date.now() - 60_000).toISOString(), expired.email)
      .run();
    await db
      .prepare(`UPDATE reviewer_invitations SET revoked_at = ? WHERE email = ?`)
      .bind(new Date().toISOString(), revoked.email)
      .run();
    for (const identity of [expired, revoked]) {
      const { jar } = await signInWithGoogle(app, identity);
      await expectNoAccess(app, jar);
    }
    expect(await count(db, "reviewer_grants")).toBe(0);
    expect(await count(db, "reviewer_invitations", "claimed_at IS NOT NULL")).toBe(0);
  });
});

describe("sessions and access removal", () => {
  test("anonymous requests are denied", async () => {
    const { app } = await createApp();
    await expectAnonymous(app);
    for (const [method, path] of [
      ["POST", "/"],
      ["GET", "/api/kawal-probe"],
      ["POST", "/api/kawal-probe"],
      ["GET", "/_void/pages/index.json"],
    ] as const) {
      await expectJsonError(await app.fetch(path, { method, origin: APP_ORIGIN }), 401);
    }
    // A browser-like Accept header does not make an unprotected path a page.
    await expectJsonError(await page(app, "/kawal-missing-page"), 401);
    const head = await app.fetch("/", { method: "HEAD" });
    expectRedirect(head, "/sign-in");
    const session = await app.fetch("/api/auth/get-session");
    expect(session.status).toBe(200);
    expect(await session.json()).toBeNull();
  });

  test("logout ends the session, and the old cookie stays signed out", async () => {
    const { app, db } = await createApp();
    const { jar, id } = await reviewer(app, db);
    const stolen = jar.clone();
    // A cross-origin logout is refused and the session stays valid.
    const crossOrigin = await app.fetch("/api/auth/sign-out", {
      method: "POST",
      jar: jar.clone(),
      origin: EVIL_ORIGIN,
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(crossOrigin.status).toBe(403);
    await expectReviewer(app, jar);
    const logout = await app.fetch("/api/auth/sign-out", {
      method: "POST",
      jar,
      origin: APP_ORIGIN,
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(logout.status).toBe(200);
    expectNoStore(logout);
    expect(jar.has(SESSION_COOKIE)).toBe(false);
    expect(await count(db, "session", "userId = ?", id)).toBe(0);
    await expectAnonymous(app, jar);
    await expectAnonymous(app, stolen);
  });

  test("a session has an absolute lifetime and is anonymous after expiry", async () => {
    const { app, db } = await createApp();
    const { jar, id } = await reviewer(app, db);
    // Ten hours into a 12-hour session: a sliding session would extend it here.
    await setSessionExpiry(db, id, 2 * 60 * 60 * 1000);
    const expiry = () =>
      db.prepare(`SELECT expiresAt FROM "session" WHERE userId = ?`).bind(id).first();
    const before = await expiry();
    await expectReviewer(app, jar);
    await app.fetch("/api/auth/get-session", { jar });
    expect(await expiry()).toEqual(before);
    await setSessionExpiry(db, id, -60_000);
    await expectAnonymous(app, jar);
  });

  test("a deleted session row takes effect on the next request", async () => {
    const { app, db } = await createApp();
    const { jar, id } = await reviewer(app, db);
    await db.prepare(`DELETE FROM "session" WHERE userId = ?`).bind(id).run();
    await expectAnonymous(app, jar);
  });

  test("a grant revoked during a valid session is denied on the next request", async () => {
    const { app, db } = await createApp();
    const { jar, id } = await reviewer(app, db);
    await db
      .prepare(`UPDATE reviewer_grants SET revoked_at = ? WHERE user_id = ?`)
      .bind(new Date().toISOString(), id)
      .run();
    // The native session is still valid; only the grant check denies access.
    const session = await app.fetch("/api/auth/get-session", { jar });
    expect(((await session.json()) as { user: { id: string } }).user.id).toBe(id);
    await expectNoAccess(app, jar);
  });

  test("an admin revocation ends the reviewer's sessions; a reviewer cannot revoke", async () => {
    const { app, db } = await createApp();
    const { jar, id } = await reviewer(app, db);
    const peer = await reviewer(app, db);
    const admin = await reviewer(app, db, profile(), "admin");
    // Negative control: a reviewer actor changes nothing.
    expect(
      await revokeGrant(db as never, { targetUserId: id, actorUserId: peer.id }),
    ).toMatchObject({
      revoked: false,
    });
    expect(await count(db, "session", "userId = ?", id)).toBe(1);
    await expectReviewer(app, jar);
    const result = await revokeGrant(db as never, { targetUserId: id, actorUserId: admin.id });
    expect(result).toMatchObject({ revoked: true });
    expect(await count(db, "session", "userId = ?", id)).toBe(0);
    await expectAnonymous(app, jar);
    // Control: other reviewers keep access.
    await expectReviewer(app, peer.jar);
    await expectReviewer(app, admin.jar);
  });

  test("a new invitation after revocation creates a new grant and keeps the old one revoked", async () => {
    const { app, db } = await createApp();
    const { identity, jar, id } = await reviewer(app, db);
    const admin = await reviewer(app, db, profile(), "admin");
    const before = await db
      .prepare(`SELECT id FROM reviewer_grants WHERE user_id = ?`)
      .bind(id)
      .first<{ id: string }>();
    await revokeGrant(db as never, { targetUserId: id, actorUserId: admin.id });
    await expectAnonymous(app, jar);
    // The revoked user signs in again; without a new invitation there is no access.
    const returning = await signInWithGoogle(app, identity);
    await expectNoAccess(app, returning.jar);
    expect(
      await createInvitation(db as never, {
        email: identity.email,
        role: "reviewer",
        source: { via: "admin", actorUserId: admin.id },
      }),
    ).toMatchObject({ created: true });
    await expectReviewer(app, returning.jar);
    expect(await count(db, "reviewer_grants", "user_id = ?", id)).toBe(2);
    expect(await count(db, "reviewer_grants", "user_id = ? AND revoked_at IS NULL", id)).toBe(1);
    expect(
      await count(db, "reviewer_grants", "id = ? AND revoked_at IS NOT NULL", before!.id),
    ).toBe(1);
  });

  test.each([
    [
      "Google subject",
      `UPDATE reviewer_grants SET google_subject = 'synthetic-other-subject' WHERE user_id = ?`,
    ],
    [
      "native user",
      `UPDATE reviewer_grants SET user_id = 'synthetic-other-user' WHERE user_id = ?`,
    ],
    [
      "linked account",
      `UPDATE "account" SET accountId = 'synthetic-other-subject' WHERE userId = ?`,
    ],
  ])("a grant with a mismatched %s gives no access", async (_, statement) => {
    const { app, db } = await createApp();
    const { jar, id } = await reviewer(app, db);
    await db.prepare(statement).bind(id).run();
    await expectNoAccess(app, jar);
  });

  test("a cross-origin POST does not use the session cookie", async () => {
    const { app, db } = await createApp();
    const { jar } = await reviewer(app, db);
    const sameOrigin = await app.fetch("/api/kawal-probe", {
      method: "POST",
      jar,
      origin: APP_ORIGIN,
    });
    expect(sameOrigin.status).toBe(404);
    await expectJsonError(
      await app.fetch("/api/kawal-probe", { method: "POST", jar, origin: EVIL_ORIGIN }),
      401,
    );
  });
});

describe("response policy", () => {
  test("every app response is no-store and noindex", async () => {
    const { app, db } = await createApp();
    const { jar } = await reviewer(app, db);
    const uninvited = await signInWithGoogle(app, profile());
    const responses = [
      await page(app, "/"),
      await pageData(app, "/"),
      await app.fetch("/sign-in"),
      await app.fetch("/access-pending", { jar: uninvited.jar }),
      await app.fetch("/healthz"),
      await app.fetch("/api/auth/get-session"),
      await app.fetch("/api/auth/get-session", { jar }),
      await app.fetch("/api/auth/callback/google"),
      await app.fetch("/__kawal-missing-route"),
      await page(app, "/", jar),
      await pageData(app, "/", jar),
      await page(app, "/", uninvited.jar),
      await pageData(app, "/", uninvited.jar),
      uninvited.callback,
    ];
    for (const response of responses) {
      expectNoStore(response);
      expectNoindex(response);
      if ((response.headers.get("content-type") ?? "").includes("text/html")) {
        expect(await response.text()).toMatch(/<meta name="robots" content="noindex"/);
      }
    }
    // Application-owned anonymous responses keep the private policy as well.
    for (const response of [
      await page(app, "/"),
      await pageData(app, "/"),
      await app.fetch("/healthz"),
    ]) {
      expect(directives(response)).toContain("private");
    }
  });
});

describe("production build boundary", () => {
  test("reject a non-production app build before it can expose dev behavior", () => {
    const result = spawnSync("bash", ["-lc", "vp build"], {
      cwd: join(build.directory, "apps/app"),
      env: { ...process.env, NODE_ENV: "test" },
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("App builds require NODE_ENV=production.");
  });

  const forbidden = [
    "test/sign-in",
    "AUTH_TEST_SIGN_IN",
    "synthetic-test-key",
    "Outbound request denied by the test harness",
    "kawal-test-client",
  ];

  async function files(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { recursive: true, withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name));
  }

  test("the build contains the real Google endpoint and no test identity path", async () => {
    const contents = await Promise.all(
      (await files(build.dist))
        .filter((file) => /\.(js|json|html)$/.test(file))
        .map((file) => readFile(file, "utf8")),
    );
    const all = contents.join("\n");
    // Positive control: the native Google provider is present and unmodified.
    expect(all).toContain(GOOGLE_TOKEN_ENDPOINT);
    for (const marker of forbidden) expect(all, marker).not.toContain(marker);
    const wrangler = JSON.parse(await readFile(join(build.dist, "ssr/wrangler.json"), "utf8"));
    expect(wrangler.services ?? []).toEqual([]);
    expect(
      Object.keys(wrangler.vars ?? {}).filter((name) => /AUTH|SECRET|TEST/.test(name)),
    ).toEqual([]);
    expect(wrangler.workers_dev).toBe(false);
    expect(wrangler.preview_urls).toBe(false);
  });

  test("application source does not import test code or substitutes", async () => {
    const root = resolve(import.meta.dirname, "..");
    const sources = (await files(join(root, "apps/app"))).filter(
      (file) =>
        !/\/(node_modules|dist|\.void|\.wrangler)\//.test(file) &&
        /\.(ts|tsx|js|mjs|json)$/.test(file),
    );
    expect(sources.length).toBeGreaterThan(0);
    for (const file of sources) {
      const text = await readFile(file, "utf8");
      expect(text, file).not.toMatch(/from\s+["'][^"']*tests\//);
      expect(text, file).not.toMatch(/["']miniflare["']/);
      for (const marker of forbidden) expect(text, `${file}: ${marker}`).not.toContain(marker);
    }
  });
});
