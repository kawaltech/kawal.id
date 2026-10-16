import { sql } from "void/db";
import { check, index, sqliteTable, text, uniqueIndex } from "void/schema-d1";

// Reviewer access belongs to the editorial target only. A native sign-in gives
// no rights: access needs an active grant. Grants are keyed on the Better Auth
// user id and the Google subject from the native "account" row. The email
// address only matches an invitation once. These tables have no foreign keys
// to the auth tables, because the auth migration owns those tables.

export const reviewerInvitations = sqliteTable(
  "reviewer_invitations",
  {
    id: text("id").primaryKey(),
    // Trimmed and lowercase. Google reports it as verified before a claim.
    email: text("email").notNull(),
    role: text("role").notNull(),
    createdVia: text("created_via").notNull(),
    // NULL when the local administrative script created the invitation.
    createdByUserId: text("created_by_user_id"),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    claimedAt: text("claimed_at"),
    claimedByUserId: text("claimed_by_user_id"),
    claimedGoogleSubject: text("claimed_google_subject"),
    revokedAt: text("revoked_at"),
    revokedByUserId: text("revoked_by_user_id"),
  },
  (table) => [
    check("reviewer_invitations_role", sql`${table.role} IN ('reviewer', 'admin')`),
    check(
      "reviewer_invitations_created_via",
      sql`${table.createdVia} IN ('admin', 'bootstrap', 'local')`,
    ),
    check(
      "reviewer_invitations_claim",
      sql`(${table.claimedAt} IS NULL) = (${table.claimedByUserId} IS NULL)`,
    ),
    // One open invitation for each email address.
    uniqueIndex("reviewer_invitations_open_email")
      .on(table.email)
      .where(sql`${table.claimedAt} IS NULL AND ${table.revokedAt} IS NULL`),
  ],
);

export const reviewerGrants = sqliteTable(
  "reviewer_grants",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    googleSubject: text("google_subject").notNull(),
    role: text("role").notNull(),
    invitationId: text("invitation_id").notNull(),
    grantedAt: text("granted_at").notNull(),
    revokedAt: text("revoked_at"),
    // NULL when the local administrative script revoked the grant.
    revokedByUserId: text("revoked_by_user_id"),
    revocationReason: text("revocation_reason"),
  },
  (table) => [
    check("reviewer_grants_role", sql`${table.role} IN ('reviewer', 'admin')`),
    // One active grant for each user and each Google subject. Revoked grants
    // stay for the audit trail. Only a new invitation can grant access again.
    uniqueIndex("reviewer_grants_active_user_id")
      .on(table.userId)
      .where(sql`${table.revokedAt} IS NULL`),
    uniqueIndex("reviewer_grants_active_google_subject")
      .on(table.googleSubject)
      .where(sql`${table.revokedAt} IS NULL`),
    uniqueIndex("reviewer_grants_invitation_id").on(table.invitationId),
    index("reviewer_grants_user_id").on(table.userId),
  ],
);

// Append-only record of administrative changes and invitation claims.
export const reviewerAuditEvents = sqliteTable(
  "reviewer_audit_events",
  {
    id: text("id").primaryKey(),
    occurredAt: text("occurred_at").notNull(),
    // NULL when the local administrative script made the change.
    actorUserId: text("actor_user_id"),
    action: text("action").notNull(),
    targetUserId: text("target_user_id"),
    invitationId: text("invitation_id"),
    detail: text("detail"),
  },
  (table) => [
    check(
      "reviewer_audit_events_action",
      sql`${table.action} IN ('invitation.create', 'invitation.revoke', 'invitation.claim', 'grant.revoke')`,
    ),
    index("reviewer_audit_events_occurred_at").on(table.occurredAt),
  ],
);
