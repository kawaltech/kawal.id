// Reviewer access storage. This module uses only a D1-compatible binding and
// has no Void imports, so the local administrative script can use its SQL.
// Each change is one D1 batch. D1 runs a batch as one transaction and runs
// write transactions one at a time, so the conditions in each statement see
// the result of an earlier batch.

export type ReviewerRole = "reviewer" | "admin";

/** The validated native identity from getAppIdentity(c). */
export type ReviewerIdentity = {
  userId: string;
  googleSubject: string;
  /** Lowercase and verified by Google. */
  email: string;
  sessionId: string;
};

export type ReviewerGrant = {
  grantId: string;
  userId: string;
  googleSubject: string;
  role: ReviewerRole;
  grantedAt: string;
};

type RunResult = { meta: { changes?: number } };

export interface ReviewerStatement {
  bind(...values: unknown[]): ReviewerStatement;
  first(): Promise<unknown>;
  all(): Promise<{ results?: unknown[] }>;
  run(): Promise<unknown>;
}

/** The subset of a D1 database or D1 session that this module uses. */
export interface ReviewerDb {
  prepare(query: string): ReviewerStatement;
  batch(statements: ReviewerStatement[]): Promise<unknown[]>;
}

export type SqlStatement = { sql: string; params: Array<string | number | null> };

export const INVITATION_HOURS = 72;
const MAX_INVITATION_HOURS = 24 * 14;

export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@"'\\]+@[^\s@"'\\]+\.[^\s@"'\\]+$/.test(email)) {
    throw new Error("The email address is not valid.");
  }
  return email;
}

function requireId(value: string, name: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) {
    throw new Error(`The ${name} is not valid.`);
  }
  return value;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function timestamp(date: Date): string {
  return date.toISOString();
}

function expiry(now: Date, hours: number): string {
  if (!Number.isInteger(hours) || hours < 1 || hours > MAX_INVITATION_HOURS) {
    throw new Error(`The invitation must expire in 1 to ${MAX_INVITATION_HOURS} hours.`);
  }
  return timestamp(new Date(now.getTime() + hours * 3_600_000));
}

const ACTIVE_ADMIN = (param: string) =>
  `EXISTS (SELECT 1 FROM reviewer_grants a WHERE a.user_id = ${param} AND a.role = 'admin' AND a.revoked_at IS NULL)`;
const NO_ACTIVE_ADMIN =
  "NOT EXISTS (SELECT 1 FROM reviewer_grants a WHERE a.role = 'admin' AND a.revoked_at IS NULL)";

export type InvitationSource =
  | { via: "admin"; actorUserId: string }
  | { via: "bootstrap" }
  | { via: "local" };

export type InvitationInput = {
  email: string;
  role: ReviewerRole;
  source: InvitationSource;
  now?: Date;
  hours?: number;
};

/**
 * An admin invitation needs an active admin actor. A bootstrap invitation is
 * for the first admin: it is created only when no active admin and no open
 * bootstrap invitation exist. A local invitation comes from the local script.
 */
export function invitationStatements(input: InvitationInput & { id: string; auditId: string }) {
  const email = normalizeEmail(input.email);
  const now = input.now ?? new Date();
  const at = timestamp(now);
  const expiresAt = expiry(now, input.hours ?? INVITATION_HOURS);
  const { source } = input;
  if (input.role !== "reviewer" && input.role !== "admin")
    throw new Error("The role is not valid.");
  if (source.via === "bootstrap" && input.role !== "admin") {
    throw new Error("A bootstrap invitation is for an admin.");
  }
  const actor = source.via === "admin" ? requireId(source.actorUserId, "actor") : null;
  const condition =
    source.via === "admin"
      ? ACTIVE_ADMIN("?6")
      : source.via === "bootstrap"
        ? `${NO_ACTIVE_ADMIN} AND NOT EXISTS (SELECT 1 FROM reviewer_invitations b WHERE b.created_via = 'bootstrap' AND b.claimed_at IS NULL AND b.revoked_at IS NULL AND b.expires_at > ?4)`
        : "1 = 1";
  const params = [input.id, email, input.role, at, expiresAt, actor, source.via, input.auditId];
  return [
    // An expired open invitation no longer blocks a new one for the same email.
    {
      sql: "UPDATE reviewer_invitations SET revoked_at = ?2 WHERE email = ?1 AND claimed_at IS NULL AND revoked_at IS NULL AND expires_at <= ?2",
      params: [email, at],
    },
    {
      sql: `INSERT INTO reviewer_invitations (id, email, role, created_via, created_by_user_id, created_at, expires_at)
SELECT ?1, ?2, ?3, ?7, ?6, ?4, ?5
WHERE ${condition}
  AND NOT EXISTS (SELECT 1 FROM reviewer_invitations o WHERE o.email = ?2 AND o.claimed_at IS NULL AND o.revoked_at IS NULL)`,
      params,
    },
    {
      sql: `INSERT INTO reviewer_audit_events (id, occurred_at, actor_user_id, action, invitation_id, detail)
SELECT ?8, ?4, ?6, 'invitation.create', id, ?7 || ':' || ?3 FROM reviewer_invitations WHERE id = ?1`,
      params,
    },
  ] satisfies SqlStatement[];
}

export function claimStatements(input: {
  identity: ReviewerIdentity;
  grantId: string;
  auditId: string;
  now: Date;
}) {
  const userId = requireId(input.identity.userId, "user id");
  const subject = requireId(input.identity.googleSubject, "Google subject");
  const params = [
    input.grantId,
    userId,
    subject,
    normalizeEmail(input.identity.email),
    timestamp(input.now),
    input.auditId,
  ];
  return [
    {
      sql: `INSERT INTO reviewer_grants (id, user_id, google_subject, role, invitation_id, granted_at)
SELECT ?1, ?2, ?3, i.role, i.id, ?5 FROM reviewer_invitations i
WHERE i.email = ?4 AND i.claimed_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ?5
  AND NOT EXISTS (SELECT 1 FROM reviewer_grants g WHERE g.revoked_at IS NULL AND (g.user_id = ?2 OR g.google_subject = ?3))
  AND (i.created_via <> 'bootstrap' OR ${NO_ACTIVE_ADMIN})`,
      params,
    },
    {
      sql: `UPDATE reviewer_invitations SET claimed_at = ?5, claimed_by_user_id = ?2, claimed_google_subject = ?3
WHERE id = (SELECT invitation_id FROM reviewer_grants WHERE id = ?1) AND claimed_at IS NULL`,
      params,
    },
    {
      sql: `INSERT INTO reviewer_audit_events (id, occurred_at, actor_user_id, action, target_user_id, invitation_id)
SELECT ?6, ?5, ?2, 'invitation.claim', ?2, invitation_id FROM reviewer_grants WHERE id = ?1`,
      params,
    },
  ] satisfies SqlStatement[];
}

/**
 * Revoke the active grant of a user. `actorUserId` null is only for the local
 * script. An actor must be an active admin and cannot revoke the last active
 * admin. The batch also revokes open invitations for the same email and
 * deletes the user's native sessions. The guard denies a revoked grant on the
 * next request without the session deletion.
 */
export function revokeGrantStatements(input: {
  targetUserId: string;
  actorUserId: string | null;
  reason?: string;
  now: Date;
  auditId: string;
}) {
  const reason = (input.reason ?? "").trim().slice(0, 500) || null;
  const params = [
    requireId(input.targetUserId, "user id"),
    input.actorUserId === null ? null : requireId(input.actorUserId, "actor"),
    timestamp(input.now),
    reason,
    input.auditId,
  ];
  const revokedNow = "SELECT 1 FROM reviewer_grants r WHERE r.user_id = ?1 AND r.revoked_at = ?3";
  return [
    {
      sql: `UPDATE reviewer_grants SET revoked_at = ?3, revoked_by_user_id = ?2, revocation_reason = ?4
WHERE user_id = ?1 AND revoked_at IS NULL
  AND (?2 IS NULL OR (${ACTIVE_ADMIN("?2")}
    AND (role <> 'admin' OR (SELECT COUNT(*) FROM reviewer_grants a WHERE a.role = 'admin' AND a.revoked_at IS NULL) > 1)))`,
      params,
    },
    {
      sql: `UPDATE reviewer_invitations SET revoked_at = ?3, revoked_by_user_id = ?2
WHERE claimed_at IS NULL AND revoked_at IS NULL AND email IN (
  SELECT i.email FROM reviewer_invitations i JOIN reviewer_grants g ON g.invitation_id = i.id
  WHERE g.user_id = ?1 AND g.revoked_at = ?3)`,
      params,
    },
    {
      sql: `DELETE FROM "session" WHERE "userId" = ?1 AND EXISTS (${revokedNow})
  AND NOT EXISTS (SELECT 1 FROM reviewer_grants g WHERE g.user_id = ?1 AND g.revoked_at IS NULL)`,
      params,
    },
    {
      sql: `INSERT INTO reviewer_audit_events (id, occurred_at, actor_user_id, action, target_user_id, invitation_id, detail)
SELECT ?5, ?3, ?2, 'grant.revoke', ?1, r.invitation_id, ?4 FROM reviewer_grants r
WHERE r.user_id = ?1 AND r.revoked_at = ?3 LIMIT 1`,
      params,
    },
  ] satisfies SqlStatement[];
}

export function revokeInvitationStatements(input: {
  invitationId: string;
  actorUserId: string | null;
  now: Date;
  auditId: string;
}) {
  const params = [
    requireId(input.invitationId, "invitation id"),
    input.actorUserId === null ? null : requireId(input.actorUserId, "actor"),
    timestamp(input.now),
    input.auditId,
  ];
  return [
    {
      sql: `UPDATE reviewer_invitations SET revoked_at = ?3, revoked_by_user_id = ?2
WHERE id = ?1 AND claimed_at IS NULL AND revoked_at IS NULL AND (?2 IS NULL OR ${ACTIVE_ADMIN("?2")})`,
      params,
    },
    {
      sql: `INSERT INTO reviewer_audit_events (id, occurred_at, actor_user_id, action, invitation_id)
SELECT ?4, ?3, ?2, 'invitation.revoke', id FROM reviewer_invitations WHERE id = ?1 AND revoked_at = ?3`,
      params,
    },
  ] satisfies SqlStatement[];
}

// D1 rejects a statement when the number of values differs from SQLite's
// parameter count, which is the highest ?N in the statement.
function boundParams(statement: SqlStatement) {
  const highest = Math.max(0, ...[...statement.sql.matchAll(/\?(\d+)/g)].map((m) => Number(m[1])));
  return statement.params.slice(0, highest);
}

export async function runBatch(db: ReviewerDb, statements: SqlStatement[]): Promise<number[]> {
  const results = (await db.batch(
    statements.map((s) => db.prepare(s.sql).bind(...boundParams(s))),
  )) as RunResult[];
  return results.map((r) => r.meta?.changes ?? 0);
}

type GrantRow = {
  id: string;
  user_id: string;
  google_subject: string;
  role: ReviewerRole;
  granted_at: string;
};

function toGrant(row: GrantRow): ReviewerGrant {
  return {
    grantId: row.id,
    userId: row.user_id,
    googleSubject: row.google_subject,
    role: row.role,
    grantedAt: row.granted_at,
  };
}

/** Active grants that match the user id or the Google subject. */
export async function activeGrantRows(db: ReviewerDb, identity: ReviewerIdentity) {
  const { results } = await db
    .prepare(
      "SELECT id, user_id, google_subject, role, granted_at FROM reviewer_grants WHERE revoked_at IS NULL AND (user_id = ?1 OR google_subject = ?2)",
    )
    .bind(identity.userId, identity.googleSubject)
    .all();
  return ((results ?? []) as GrantRow[]).map(toGrant);
}

export async function hasOpenInvitation(db: ReviewerDb, email: string, now: Date) {
  let normalized: string;
  try {
    normalized = normalizeEmail(email);
  } catch {
    return false;
  }
  const row = await db
    .prepare(
      "SELECT 1 AS open FROM reviewer_invitations WHERE email = ?1 AND claimed_at IS NULL AND revoked_at IS NULL AND expires_at > ?2 LIMIT 1",
    )
    .bind(normalized, timestamp(now))
    .first();
  return row !== null;
}

/** Claim an open invitation for this identity. Returns true when this call made the grant. */
export async function claimInvitation(
  db: ReviewerDb,
  identity: ReviewerIdentity,
  now = new Date(),
) {
  const [inserted] = await runBatch(
    db,
    claimStatements({ identity, grantId: newId(), auditId: newId(), now }),
  );
  return inserted === 1;
}

export type InvitationResult = { created: true; id: string } | { created: false; id: null };

export async function createInvitation(
  db: ReviewerDb,
  input: InvitationInput,
): Promise<InvitationResult> {
  const id = newId();
  const [, inserted] = await runBatch(db, invitationStatements({ ...input, id, auditId: newId() }));
  return inserted === 1 ? { created: true, id } : { created: false, id: null };
}

export async function revokeGrant(
  db: ReviewerDb,
  input: { targetUserId: string; actorUserId: string; reason?: string; now?: Date },
) {
  const [revoked, , sessionsDeleted] = await runBatch(
    db,
    revokeGrantStatements({ ...input, now: input.now ?? new Date(), auditId: newId() }),
  );
  return { revoked: revoked === 1, sessionsDeleted: sessionsDeleted ?? 0 };
}

export async function revokeInvitation(
  db: ReviewerDb,
  input: { invitationId: string; actorUserId: string; now?: Date },
) {
  const [revoked] = await runBatch(
    db,
    revokeInvitationStatements({ ...input, now: input.now ?? new Date(), auditId: newId() }),
  );
  return { revoked: revoked === 1 };
}
