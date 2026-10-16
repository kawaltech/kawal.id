import { env } from "void/env";

import {
  activeGrantRows,
  claimInvitation,
  hasOpenInvitation,
  type ReviewerDb,
  type ReviewerGrant,
  type ReviewerIdentity,
  type ReviewerRole,
} from "./reviewer-store.ts";

export type ReviewerDenial = "unauthenticated" | "no_grant" | "identity_mismatch" | "role";

/**
 * Void's error handler returns getResponse() for a thrown error. The editorial
 * middleware changes this to a redirect for protected page GET requests.
 */
export class ReviewerAccessError extends Error {
  readonly status: 401 | 403;
  readonly reason: ReviewerDenial;

  constructor(reason: ReviewerDenial) {
    super(reason === "unauthenticated" ? "Sign-in is necessary." : "Reviewer access is necessary.");
    this.name = "ReviewerAccessError";
    this.reason = reason;
    this.status = reason === "unauthenticated" ? 401 : 403;
  }

  getResponse(): Response {
    return Response.json(
      { error: this.status === 401 ? "unauthenticated" : "forbidden" },
      {
        status: this.status,
        headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
      },
    );
  }
}

export type ReviewerGuardOptions = { role?: ReviewerRole; now?: Date };

/**
 * Deny by default. The identity must come from the native session through
 * getEditorialIdentity(), never from request data. Each call reads the current
 * grant, so a revoked grant fails on the next request even with a valid
 * session. A first request after sign-in can claim one open invitation.
 */
export async function authorizeReviewer(
  db: ReviewerDb,
  identity: ReviewerIdentity | null,
  options: ReviewerGuardOptions = {},
): Promise<ReviewerGrant> {
  if (!identity?.userId || !identity.googleSubject || !identity.email) {
    throw new ReviewerAccessError("unauthenticated");
  }
  const now = options.now ?? new Date();
  let grants = await activeGrantRows(db, identity);
  if (grants.length === 0 && (await hasOpenInvitation(db, identity.email, now))) {
    await claimInvitation(db, identity, now);
    grants = await activeGrantRows(db, identity);
  }
  if (grants.length === 0) throw new ReviewerAccessError("no_grant");
  const grant = grants[0];
  if (
    grants.length !== 1 ||
    grant.userId !== identity.userId ||
    grant.googleSubject !== identity.googleSubject
  ) {
    throw new ReviewerAccessError("identity_mismatch");
  }
  if (options.role === "admin" && grant.role !== "admin") throw new ReviewerAccessError("role");
  return grant;
}

/**
 * Reads from the D1 primary, so a replica cannot return a grant that was
 * already revoked. A bare binding without sessions also reads the primary.
 */
export function primaryReviewerDb(): ReviewerDb {
  const binding = env.DB as
    | (ReviewerDb & { withSession?: (constraint: string) => ReviewerDb })
    | undefined;
  if (!binding) throw new Error("The D1 binding 'DB' is not available.");
  return typeof binding.withSession === "function" ? binding.withSession("first-primary") : binding;
}

/** Call with `await getEditorialIdentity()` at the authorization boundary. */
export function requireReviewer(
  identity: ReviewerIdentity | null,
  options?: ReviewerGuardOptions,
): Promise<ReviewerGrant> {
  return authorizeReviewer(primaryReviewerDb(), identity, options);
}
