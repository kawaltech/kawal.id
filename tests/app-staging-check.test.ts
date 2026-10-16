import { execFile } from "node:child_process";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "vite-plus/test";

const version = "33333333-3333-4333-8333-333333333333";
const run = promisify(execFile);
const check = resolve("scripts/check-app-staging.mjs");

/** Run the check and return its stderr. The command line is not part of it. */
async function failure(...args: string[]) {
  const error = await run(process.execPath, [check, ...args]).then(
    () => undefined,
    (reason: { code?: number; stderr?: string }) => reason,
  );
  expect(error, "the check must fail").toBeDefined();
  expect(error!.code).not.toBe(0);
  return error!.stderr ?? "";
}

type Fault =
  | "wrong-version"
  | "home-allowed"
  | "offsite-sign-in"
  | "data-redirect"
  | "public-cache"
  | "missing-private"
  | "missing-robots-header"
  | "missing-robots-meta"
  | "callback-session"
  | "health-diagnostics"
  | "health-public"
  | "missing-route-allowed";

/** A synthetic app origin that follows the agreed contract unless a fault is set. */
async function appOrigin(fault?: Fault, servedVersion: string | null = version) {
  const server = createServer((request, response) => {
    const path = new URL(request.url!, "http://local").pathname;
    const app = (status: number, headers: Record<string, string> = {}) => {
      response.statusCode = status;
      response.setHeader(
        "Cache-Control",
        fault === "public-cache"
          ? "public, max-age=300"
          : fault === "missing-private"
            ? "no-store"
            : "private, no-store",
      );
      if (fault !== "missing-robots-header") response.setHeader("X-Robots-Tag", "noindex");
      for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
    };
    const html = (res: ServerResponse) =>
      res.end(
        `<html><head>${fault === "missing-robots-meta" ? "" : '<meta name="robots" content="noindex">'}</head></html>`,
      );
    if (path === "/__void/ready") {
      response.setHeader("Cache-Control", "no-store");
      if (servedVersion === null) {
        response.writeHead(404).end();
        return;
      }
      response.end(
        JSON.stringify({
          ready: true,
          versionId:
            fault === "wrong-version" ? "44444444-4444-4444-8444-444444444444" : servedVersion,
        }),
      );
      return;
    }
    if (path === "/") {
      if (fault === "home-allowed") {
        app(200, { "Content-Type": "text/html" });
        html(response);
        return;
      }
      app(303, {
        Location: fault === "offsite-sign-in" ? "https://evil.example/sign-in" : "/sign-in",
      });
      response.end();
      return;
    }
    if (path === "/_void/pages/index.json") {
      if (fault === "data-redirect") {
        app(303, { Location: "/sign-in" });
        response.end();
        return;
      }
      app(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    if (path === "/sign-in") {
      app(200, { "Content-Type": "text/html" });
      html(response);
      return;
    }
    if (path === "/api/auth/get-session") {
      // Native Better Auth policy: no-store without private is acceptable here.
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("X-Robots-Tag", "noindex");
      response.setHeader("Content-Type", "application/json");
      response.end("null");
      return;
    }
    if (path === "/api/auth/callback/google") {
      response.statusCode = 302;
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("X-Robots-Tag", "noindex");
      response.setHeader("Location", "/api/auth/error?error=state_not_found");
      if (fault === "callback-session") {
        response.setHeader(
          "Set-Cookie",
          "__Secure-better-auth.session_token=synthetic; Path=/; HttpOnly; Secure; SameSite=Lax",
        );
      }
      response.end();
      return;
    }
    if (path === "/healthz") {
      app(200, { "Content-Type": "application/json" });
      if (fault === "health-public") response.setHeader("Cache-Control", "no-store");
      response.end(
        JSON.stringify(
          fault === "health-diagnostics"
            ? { status: "ok", database: "synthetic-d1-id" }
            : { status: "ok" },
        ),
      );
      return;
    }
    if (fault === "missing-route-allowed") {
      app(200, { "Content-Type": "application/json" });
      response.end("{}");
      return;
    }
    app(404);
    response.end();
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () =>
      new Promise<void>((done, fail) => server.close((error) => (error ? fail(error) : done()))),
  };
}

test("accept an app origin that follows the access and response contract", async () => {
  const app = await appOrigin();
  const absent = await appOrigin(undefined, null);
  try {
    await expect(
      run(process.execPath, [check, app.origin, version, absent.origin]),
    ).resolves.toMatchObject({
      stdout: expect.stringContaining("App staging checks passed"),
    });
  } finally {
    await Promise.all([app.close(), absent.close()]);
  }
});

test.each<[Fault, RegExp]>([
  ["wrong-version", /versionId/],
  ["home-allowed", /\/: anonymous page requests must get 303/],
  ["offsite-sign-in", /\/: sign-in redirect must stay on this origin/],
  ["data-redirect", /\/_void\/pages\/index\.json: anonymous data requests must get 401/],
  ["public-cache", /no-store/],
  ["missing-private", /private/],
  ["missing-robots-header", /noindex header/],
  ["missing-robots-meta", /noindex meta/],
  ["callback-session", /callback\/google: no session/],
  ["health-diagnostics", /\/healthz: minimal status only/],
  ["health-public", /\/healthz: private/],
  ["missing-route-allowed", /__kawal-missing-route/],
])("reject an app origin with fault %s", async (fault, message) => {
  const app = await appOrigin(fault);
  try {
    expect(await failure(app.origin, version)).toMatch(message);
  } finally {
    await app.close();
  }
});

// The positive case above passes with the same app fixture, so each
// rejection below comes from the prohibited origin alone.
test.each([
  ["the expected version", version],
  ["an older version", "66666666-6666-4666-8666-666666666666"],
  ["a ready response without a version", ""],
])("reject a prohibited origin that still serves %s", async (_, served) => {
  const app = await appOrigin();
  const stale = await appOrigin(undefined, served);
  try {
    expect(await failure(app.origin, version, stale.origin)).toContain(
      stale.origin.replace("http://", ""),
    );
  } finally {
    await Promise.all([app.close(), stale.close()]);
  }
});

test("treat a network failure on a prohibited origin as inconclusive", async () => {
  const app = await appOrigin();
  const closed = await appOrigin();
  await closed.close();
  try {
    expect(await failure(app.origin, version, closed.origin)).toMatch(/inconclusive/i);
  } finally {
    await app.close();
  }
});

test("reject missing or invalid arguments", async () => {
  expect(await failure()).toMatch(/Usage/);
  // Plain HTTP is allowed only on a loopback host.
  expect(await failure("http://example.test", version)).toMatch(/use https/);
  expect(await failure("http://127.0.0.1:1", "not-a-uuid")).toMatch(/Usage/);
});
