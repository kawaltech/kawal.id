import { defineMiddleware } from "void";
import { AppAccessError, getAppIdentity } from "../lib/identity.ts";
import { requireReviewer } from "../lib/reviewer-guard.ts";

// Deny by default. Only these paths work without a reviewer grant.
const OPEN_PATHS = new Set(["/healthz", "/sign-in", "/sign-out", "/access-pending"]);

// Protected page routes. A direct GET of one of these redirects to a page.
// Every other protected request gets a JSON 401 or 403.
const PROTECTED_PAGES = new Set(["/"]);

function isOpen(method: string, path: string) {
  if (path === "/api/auth" || path.startsWith("/api/auth/")) return true;
  if (OPEN_PATHS.has(path)) return true;
  if (method !== "GET" && method !== "HEAD") return false;
  // Hash-named build code only. It contains no records.
  if (path.startsWith("/assets/")) return true;
  // The dev server sends source modules such as /pages/sign-in.tsx through the
  // Worker. Builds remove this branch.
  return import.meta.env.DEV && /\.(?:[cm]?[jt]sx?|css)$/.test(path);
}

function isPageDocumentRequest(method: string, path: string, headers: Headers) {
  // Void client navigation sends X-VoidPages to read page data.
  return (
    (method === "GET" || method === "HEAD") &&
    PROTECTED_PAGES.has(path) &&
    headers.get("X-VoidPages") === null
  );
}

function seeOther(location: string) {
  return new Response(null, {
    status: 303,
    headers: { Location: location, "Cache-Control": "private, no-store" },
  });
}

export default defineMiddleware(async (c, next) => {
  const { method, path } = c.req;
  if (isOpen(method, path)) return next();

  const page = isPageDocumentRequest(method, path, c.req.raw.headers);
  const identity = await getAppIdentity(c);
  if (!identity) return page ? seeOther("/sign-in") : new AppAccessError(401).getResponse();

  try {
    await requireReviewer(identity);
  } catch (error) {
    // AppAccessError and the reviewer guard's error both carry a status.
    const status = (error as { status?: unknown }).status;
    if (page && status === 401) return seeOther("/sign-in");
    if (page && status === 403) return seeOther("/access-pending");
    throw error;
  }
  return next();
});
