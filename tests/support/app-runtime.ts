// Test-only harness for the app Worker. It builds a copy of the app
// source in a temporary directory and runs the built Worker in Miniflare with
// temporary D1 and R2 state. Nothing here is imported by application code.
import { execFile } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cp, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

export const APP_ORIGIN = "https://app.kawal.id";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_CALLBACK = `${APP_ORIGIN}/api/auth/callback/google`;
// Not credentials. Google never sees these values.
export const TEST_GOOGLE_CLIENT_ID = "kawal-test-client.apps.googleusercontent.com";
export const TEST_GOOGLE_CLIENT_SECRET = "kawal-test-client-secret";

const repository = resolve(import.meta.dirname, "../..");
const run = promisify(execFile);

export interface AppBuild {
  directory: string;
  dist: string;
  dispose(): Promise<void>;
}

/**
 * Build the checked-out app source into a temporary copy. Void writes its
 * generated `.void` files and `dist` below the working directory, so building a
 * copy keeps the checkout and any running dev server unchanged.
 */
export async function buildApp(source = join(repository, "apps/app")): Promise<AppBuild> {
  const directory = await mkdtemp(join(tmpdir(), "kawal-app-build-"));
  const target = join(directory, "apps/app");
  const skipped = new Set(["node_modules", "dist", ".void", ".wrangler", ".void-wrangler.jsonc"]);
  await cp(source, target, {
    recursive: true,
    filter: (path) => !skipped.has(relative(source, path).split("/")[0]!),
  });
  await cp(join(repository, "app"), join(directory, "app"), { recursive: true });
  await symlink(join(repository, "apps/app/node_modules"), join(target, "node_modules"), "dir");
  await symlink(join(repository, "node_modules"), join(directory, "node_modules"), "dir");
  await run("bash", ["-lc", "vp build"], {
    cwd: target,
    // Vitest sets NODE_ENV=test, and Vite then keeps import.meta.env.DEV true.
    // Build exactly as a deployment does.
    env: { ...withoutCredentials(process.env), NODE_ENV: "production" },
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    directory,
    dist: join(target, "dist"),
    dispose: () => rm(directory, { recursive: true, force: true }),
  };
}

/** Remove any real provider or Cloudflare credential from a child environment. */
function withoutCredentials(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([name]) => !/^(AUTH_|BETTER_AUTH_|CLOUDFLARE_|CF_|GOOGLE_|NASA_)/.test(name),
    ),
  );
}

export type OutboundHandler = (request: Request) => Response | Promise<Response>;

/**
 * Records every outbound request. Without a handler, every request is denied,
 * so a test never reaches a real network service.
 */
export class OutboundLog {
  readonly requests: { method: string; url: string }[] = [];
  handler?: OutboundHandler;

  readonly handle = async (request: Request): Promise<Response> => {
    this.requests.push({ method: request.method, url: request.url });
    return this.handler ? this.handler(request) : deny(request);
  };
}

function deny(request: Request): Response {
  return new Response(`Outbound request denied by the test harness: ${request.url}`, {
    status: 599,
  });
}

export interface SyntheticGoogleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
}

/**
 * A controlled substitute for Google's token endpoint. It answers only
 * authorization-code requests that carry the expected client, redirect URI,
 * code, and a PKCE verifier that matches the challenge in the authorization URL.
 * The ID token is unsigned. Better Auth decodes, but does not verify, the ID
 * token that it receives from the token endpoint in the code flow, so these
 * tests do not cover Google signature verification.
 */
export function googleTokenStub(expected: {
  code: string;
  codeChallenge: string;
  profile: SyntheticGoogleProfile;
}): OutboundHandler {
  return async (request) => {
    if (request.method !== "POST" || request.url !== GOOGLE_TOKEN_ENDPOINT) return deny(request);
    const form = new URLSearchParams(await request.text());
    const verifier = form.get("code_verifier") ?? "";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const clientId =
      form.get("client_id") ?? basicClientId(request.headers.get("authorization")) ?? "";
    if (
      form.get("grant_type") !== "authorization_code" ||
      form.get("code") !== expected.code ||
      form.get("redirect_uri") !== GOOGLE_CALLBACK ||
      clientId !== TEST_GOOGLE_CLIENT_ID ||
      !verifier ||
      challenge !== expected.codeChallenge
    ) {
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    }
    const now = Math.floor(Date.now() / 1000);
    const idToken = unsignedJwt({
      iss: "https://accounts.google.com",
      aud: TEST_GOOGLE_CLIENT_ID,
      iat: now,
      exp: now + 3600,
      name: "Synthetic Reviewer",
      ...expected.profile,
    });
    return Response.json({
      access_token: `synthetic-access-${randomUUID()}`,
      expires_in: 3599,
      id_token: idToken,
      scope: "openid email profile",
      token_type: "Bearer",
    });
  };
}

function basicClientId(header: string | null): string | undefined {
  if (!header?.startsWith("Basic ")) return undefined;
  const [id] = Buffer.from(header.slice(6), "base64").toString().split(":");
  return id ? decodeURIComponent(id) : undefined;
}

function unsignedJwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256", kid: "synthetic-test-key", typ: "JWT" })}.${encode(claims)}.c3ludGhldGlj`;
}

/** A minimal cookie jar for one browser profile on the app origin. */
export class CookieJar {
  private readonly cookies = new Map<string, string>();

  store(response: Response) {
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(";");
      const index = pair!.indexOf("=");
      const name = pair!.slice(0, index).trim();
      const value = pair!.slice(index + 1).trim();
      const expired = attributes.some((attribute) => {
        const [key, raw] = attribute.split("=").map((part) => part.trim());
        if (key?.toLowerCase() === "max-age") return Number(raw) <= 0;
        if (key?.toLowerCase() === "expires") return Date.parse(raw!) <= Date.now();
        return false;
      });
      if (expired || value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  has(name: string) {
    return this.cookies.has(name);
  }

  names() {
    return [...this.cookies.keys()];
  }

  header() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  clone() {
    const copy = new CookieJar();
    for (const [name, value] of this.cookies) copy.cookies.set(name, value);
    return copy;
  }
}

export interface RequestOptions extends RequestInit {
  jar?: CookieJar;
  origin?: string;
}

export interface AppRuntime {
  outbound: OutboundLog;
  /** The random internal token of this runtime, for native migration controls. */
  proxyToken: string;
  fetch(path: string, options?: RequestOptions): Promise<Response>;
  migrate(): Promise<unknown>;
  database(): Promise<D1Like>;
  setOutbound(handler?: OutboundHandler): void;
  dispose(): Promise<void>;
}

export interface D1Like {
  prepare(query: string): {
    bind(...values: unknown[]): {
      run(): Promise<unknown>;
      first<T = Record<string, unknown>>(): Promise<T | null>;
      all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
    };
    run(): Promise<unknown>;
    first<T = Record<string, unknown>>(): Promise<T | null>;
    all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  };
  batch(statements: unknown[]): Promise<unknown[]>;
}

/**
 * Start the built Worker with temporary D1/R2 state and synthetic bindings.
 * Outbound network access is denied unless a test supplies a handler.
 */
export async function startApp(
  build: AppBuild,
  options: { bindings?: Record<string, string | undefined> } = {},
): Promise<AppRuntime> {
  const state = await mkdtemp(join(tmpdir(), "kawal-app-state-"));
  const ssr = join(build.dist, "ssr");
  const files = (await readdir(ssr, { recursive: true })).filter(
    (file) => file.endsWith(".js") && file !== "index.js",
  );
  const proxyToken = randomBytes(24).toString("hex");
  const outbound = new OutboundLog();
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      modules: ["index.js", ...files].map((file) => ({
        type: "ESModule" as const,
        path: join(ssr, file),
      })),
      modulesRoot: ssr,
      compatibilityDate: "2026-10-16",
      compatibilityFlags: ["nodejs_als", "nodejs_compat"],
      d1Databases: { DB: "local" },
      r2Buckets: { STORAGE: "default" },
      d1Persist: join(state, "d1"),
      r2Persist: join(state, "r2"),
      assets: {
        directory: join(build.dist, "client"),
        binding: "ASSETS",
        routerConfig: { has_user_worker: true, invoke_user_worker_ahead_of_assets: true },
      },
      bindings: definedValues({
        BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
        AUTH_BASE_URL: APP_ORIGIN,
        AUTH_GOOGLE_CLIENT_ID: TEST_GOOGLE_CLIENT_ID,
        AUTH_GOOGLE_CLIENT_SECRET: TEST_GOOGLE_CLIENT_SECRET,
        __VOID_PROXY_TOKEN: proxyToken,
        ...options.bindings,
      }),
      outboundService: (request: Request) => outbound.handle(request),
    }),
  );

  const runtime: AppRuntime = {
    outbound,
    proxyToken,
    async fetch(path, { jar, origin, headers, ...init } = {}) {
      const merged = new Headers(headers);
      if (jar && jar.header()) merged.set("cookie", jar.header());
      if (origin) merged.set("origin", origin);
      const response = (await miniflare.dispatchFetch(new URL(path, APP_ORIGIN).href, {
        redirect: "manual",
        ...init,
        headers: merged,
      } as never)) as unknown as Response;
      jar?.store(response);
      return response;
    },
    async migrate() {
      const response = (await miniflare.dispatchFetch(`${APP_ORIGIN}/__void/migrate`, {
        method: "POST",
        headers: { "x-void-internal": proxyToken },
      })) as unknown as Response;
      const body = await response.json();
      if (!response.ok) throw new Error(`Migration failed: ${JSON.stringify(body)}`);
      return body;
    },
    async database() {
      return (await miniflare.getD1Database("DB")) as unknown as D1Like;
    },
    setOutbound(handler) {
      outbound.handler = handler;
    },
    async dispose() {
      await miniflare.dispose();
      await rm(state, { recursive: true, force: true });
    },
  };
  return runtime;
}

/** A binding set to `undefined` is left out, so a test can remove a default. */
function definedValues(values: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

export interface GoogleAuthorization {
  url: URL;
  state: string;
  codeChallenge: string;
  jar: CookieJar;
}

/** Start the native social sign-in and return Google's authorization URL. */
export async function startGoogleSignIn(
  runtime: AppRuntime,
  { jar = new CookieJar(), callbackURL = "/" } = {},
): Promise<GoogleAuthorization> {
  const start = await runtime.fetch("/api/auth/sign-in/social", {
    method: "POST",
    jar,
    origin: APP_ORIGIN,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "google", callbackURL }),
  });
  if (!start.ok) throw new Error(`Social sign-in failed: ${start.status} ${await start.text()}`);
  const url = new URL(((await start.json()) as { url: string }).url);
  return {
    url,
    state: url.searchParams.get("state") ?? "",
    codeChallenge: url.searchParams.get("code_challenge") ?? "",
    jar,
  };
}

/**
 * Call the native callback as Google would after consent. With a profile, the
 * token stub answers this one exchange. Without a profile, outbound requests
 * stay denied.
 */
export async function completeGoogleSignIn(
  runtime: AppRuntime,
  authorization: GoogleAuthorization,
  profile?: SyntheticGoogleProfile,
  { state = authorization.state, jar = authorization.jar } = {},
): Promise<Response> {
  const code = `synthetic-code-${randomUUID()}`;
  if (profile) {
    runtime.setOutbound(
      googleTokenStub({ code, codeChallenge: authorization.codeChallenge, profile }),
    );
  }
  try {
    return await runtime.fetch(
      `/api/auth/callback/google?${new URLSearchParams({ code, state })}`,
      { jar },
    );
  } finally {
    runtime.setOutbound();
  }
}

/** Complete the native Google code flow for one synthetic profile. */
export async function signInWithGoogle(
  runtime: AppRuntime,
  profile: SyntheticGoogleProfile,
  options: { jar?: CookieJar; callbackURL?: string } = {},
): Promise<{ authorization: GoogleAuthorization; callback: Response; jar: CookieJar }> {
  const authorization = await startGoogleSignIn(runtime, options);
  const callback = await completeGoogleSignIn(runtime, authorization, profile);
  return { authorization, callback, jar: authorization.jar };
}
