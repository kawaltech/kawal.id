import { sql } from "void/db";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "void/schema-d1";

// Private field report drafts and reviewer decisions. Nothing here is public.
// A submitted revision is frozen; a decision refers to exactly one frozen
// revision. Like the reviewer tables, these tables have no foreign keys to the
// auth tables. The migration adds triggers that reject changes to submitted
// revisions, reviews, and audit events.

export const reports = sqliteTable(
  "reports",
  {
    id: text("id").primaryKey(),
    state: text("state").notNull(),
    authorUserId: text("author_user_id").notNull(),
    // The open revision of a draft, or the last submitted revision.
    currentRevisionId: text("current_revision_id").notNull(),
    // Each change increments it. A write must name the version it read.
    version: integer("version").notNull(),
    // Set to a new random ID by each change. Later statements in the same D1
    // batch run only when this batch made the change.
    lastChangeId: text("last_change_id").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check(
      "reports_state",
      sql`${table.state} IN ('draft', 'in_review', 'approved', 'rejected', 'discarded')`,
    ),
    uniqueIndex("reports_last_change_id").on(table.lastChangeId),
    index("reports_author_user_id").on(table.authorUserId),
    index("reports_updated_at").on(table.updatedAt),
  ],
);

export const reportRevisions = sqliteTable(
  "report_revisions",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id").notNull(),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    account: text("account"),
    observedAt: text("observed_at"),
    province: text("province"),
    area: text("area"),
    sourceChannel: text("source_channel"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    // NULL while open. After it is set, the row does not change.
    submittedAt: text("submitted_at"),
  },
  (table) => [
    check(
      "report_revisions_source_channel",
      sql`${table.sourceChannel} IS NULL OR ${table.sourceChannel} IN ('in_person', 'phone', 'messaging', 'other')`,
    ),
    // A submitted revision has every field that a reviewer needs.
    check(
      "report_revisions_complete",
      sql`${table.submittedAt} IS NULL OR (${table.account} IS NOT NULL AND ${table.observedAt} IS NOT NULL AND ${table.province} IS NOT NULL AND ${table.area} IS NOT NULL AND ${table.sourceChannel} IS NOT NULL)`,
    ),
    uniqueIndex("report_revisions_number").on(table.reportId, table.number),
    // At most one open revision for each report.
    uniqueIndex("report_revisions_open")
      .on(table.reportId)
      .where(sql`${table.submittedAt} IS NULL`),
  ],
);

export const reportReviews = sqliteTable(
  "report_reviews",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id").notNull(),
    revisionId: text("revision_id").notNull(),
    reviewerUserId: text("reviewer_user_id").notNull(),
    reviewerGrantId: text("reviewer_grant_id").notNull(),
    decision: text("decision").notNull(),
    note: text("note"),
    decidedAt: text("decided_at").notNull(),
  },
  (table) => [
    check(
      "report_reviews_decision",
      sql`${table.decision} IN ('approve', 'request_changes', 'reject')`,
    ),
    check(
      "report_reviews_note",
      sql`${table.decision} = 'approve' OR (${table.note} IS NOT NULL AND length(${table.note}) > 0)`,
    ),
    // One decision for each revision.
    uniqueIndex("report_reviews_revision_id").on(table.revisionId),
    index("report_reviews_report_id").on(table.reportId),
  ],
);

// Append-only. IDs and states only: no report text and no review notes.
export const reportAuditEvents = sqliteTable(
  "report_audit_events",
  {
    id: text("id").primaryKey(),
    occurredAt: text("occurred_at").notNull(),
    actorUserId: text("actor_user_id").notNull(),
    actorGrantId: text("actor_grant_id").notNull(),
    action: text("action").notNull(),
    reportId: text("report_id").notNull(),
    revisionId: text("revision_id").notNull(),
    fromState: text("from_state"),
    toState: text("to_state").notNull(),
  },
  (table) => [
    check(
      "report_audit_events_action",
      sql`${table.action} IN ('report.create', 'report.submit', 'report.discard', 'review.approve', 'review.request_changes', 'review.reject')`,
    ),
    index("report_audit_events_report_id").on(table.reportId),
    index("report_audit_events_occurred_at").on(table.occurredAt),
  ],
);
