import type { CloudContext } from "void";
import { getSession } from "void/auth";

/**
 * A signed-in person, as proved by the native Void session and one Google account.
 * It gives no app access. Reviewer guards check authorization separately.
 */
export interface AppIdentity {
  /** Better Auth "user".id. Bound one-to-one to `googleSubject`. */
  userId: string;
  /** Google's stable `sub` claim, stored as "account".accountId. */
  googleSubject: string;
  /** Lowercase email that Google reported as verified at sign-in. */
  email: string;
  name: string;
  sessionId: string;
  sessionExpiresAt: Date;
}

interface AccountRow {
  providerId: string;
  accountId: string;
}

/**
 * Reads the identity for this request, or null. It does not cache: each call reads
 * the native session (already read from D1 by Void) and the account row from the
 * D1 primary. Any unexpected state gives null.
 */
export async function getAppIdentity(c: CloudContext): Promise<AppIdentity | null> {
  const state = getSession();
  if (!state) return null;
  const { user, session } = state;
  if (session.userId !== user.id || !user.emailVerified) return null;
  if (!(new Date(session.expiresAt).getTime() > Date.now())) return null;

  const { results } = await c.env.DB.withSession("first-primary")
    .prepare('SELECT "providerId", "accountId" FROM "account" WHERE "userId" = ?')
    .bind(user.id)
    .all<AccountRow>();
  // Account linking is disabled, so a valid user has exactly one Google account.
  if (results.length !== 1) return null;
  const [account] = results;
  if (account.providerId !== "google" || !account.accountId) return null;

  return {
    userId: user.id,
    googleSubject: account.accountId,
    email: user.email,
    name: user.name,
    sessionId: session.id,
    sessionExpiresAt: new Date(session.expiresAt),
  };
}

/** An access failure. Hono sends `getResponse()` when a handler throws it. */
export class AppAccessError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403) {
    super(status === 401 ? "unauthenticated" : "forbidden");
    this.status = status;
  }

  getResponse() {
    return Response.json(
      { error: this.message },
      { status: this.status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

/** Returns the identity, or throws a 401 AppAccessError. */
export async function requireAppIdentity(c: CloudContext): Promise<AppIdentity> {
  const identity = await getAppIdentity(c);
  if (!identity) throw new AppAccessError(401);
  return identity;
}
