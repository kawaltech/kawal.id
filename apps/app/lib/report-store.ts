// Private report storage. Like reviewer-store.ts, this module uses only a
// D1-compatible binding and has no Void imports. Each change is one D1 batch.
// The first statement makes the state change only when the state, the
// version, the actor's active grant, and the actor rule all match. It sets
// `last_change_id` to a new ID. The later statements run only when that ID
// is present, so they do nothing when the first statement changed no row.

import type { Decision, ReportState, RevisionContent, SourceChannel } from "./report-model.ts";
import {
  newId,
  runBatch,
  timestamp,
  type ReviewerDb,
  type SqlStatement,
} from "./reviewer-store.ts";

export type ReportDb = ReviewerDb;

/** The member who acts, from the native session and the active grant. */
export type ReportActor = {
  userId: string;
  googleSubject: string;
  grantId: string;
  role: "reviewer" | "admin";
};

export type ReportViewer = Pick<ReportActor, "userId" | "role">;

// ?3 actor user id, ?4 Google subject, ?5 grant id.
const ACTIVE_GRANT =
  "EXISTS (SELECT 1 FROM reviewer_grants g WHERE g.id = ?5 AND g.user_id = ?3 AND g.google_subject = ?4 AND g.revoked_at IS NULL)";
const ACTIVE_ADMIN =
  "EXISTS (SELECT 1 FROM reviewer_grants g WHERE g.id = ?5 AND g.user_id = ?3 AND g.role = 'admin' AND g.revoked_at IS NULL)";
// ?1 report id, ?7 change id.
const CHANGED = "EXISTS (SELECT 1 FROM reports c WHERE c.id = ?1 AND c.last_change_id = ?7)";

function actorParams(actor: ReportActor) {
  return [actor.userId, actor.googleSubject, actor.grantId] as const;
}

function contentParams(content: RevisionContent) {
  return [
    content.title,
    content.account,
    content.observedAt,
    content.province,
    content.area,
    content.sourceChannel,
  ] as const;
}

export function createStatements(input: {
  actor: ReportActor;
  content: RevisionContent;
  reportId: string;
  revisionId: string;
  changeId: string;
  now: Date;
}): SqlStatement[] {
  const params = [
    input.reportId,
    input.revisionId,
    ...actorParams(input.actor),
    timestamp(input.now),
    input.changeId,
    ...contentParams(input.content),
  ];
  return [
    {
      sql: `INSERT INTO reports (id, state, author_user_id, current_revision_id, version, last_change_id, created_at, updated_at)
SELECT ?1, 'draft', ?3, ?2, 1, ?7, ?6, ?6 WHERE ${ACTIVE_GRANT}`,
      params,
    },
    {
      sql: `INSERT INTO report_revisions (id, report_id, number, title, account, observed_at, province, area, source_channel, created_at, updated_at)
SELECT ?2, ?1, 1, ?8, ?9, ?10, ?11, ?12, ?13, ?6, ?6 WHERE ${CHANGED}`,
      params,
    },
    {
      sql: `INSERT INTO report_audit_events (id, occurred_at, actor_user_id, actor_grant_id, action, report_id, revision_id, from_state, to_state)
SELECT ?7, ?6, ?3, ?5, 'report.create', ?1, ?2, NULL, 'draft' WHERE ${CHANGED}`,
      params,
    },
  ];
}

/** Save the open revision of the actor's own draft, and with `submit`, freeze it for review. */
export function saveStatements(input: {
  actor: ReportActor;
  content: RevisionContent;
  reportId: string;
  version: number;
  changeId: string;
  now: Date;
  submit: boolean;
}): SqlStatement[] {
  const params = [
    input.reportId,
    input.version,
    ...actorParams(input.actor),
    timestamp(input.now),
    input.changeId,
    ...contentParams(input.content),
  ];
  const statements: SqlStatement[] = [
    {
      sql: `UPDATE reports SET state = ${input.submit ? "'in_review'" : "'draft'"}, version = version + 1, last_change_id = ?7, updated_at = ?6
WHERE id = ?1 AND state = 'draft' AND version = ?2 AND author_user_id = ?3 AND ${ACTIVE_GRANT}`,
      params,
    },
    {
      sql: `UPDATE report_revisions SET title = ?8, account = ?9, observed_at = ?10, province = ?11, area = ?12, source_channel = ?13,
  updated_at = ?6${input.submit ? ", submitted_at = ?6" : ""}
WHERE submitted_at IS NULL AND id = (SELECT c.current_revision_id FROM reports c WHERE c.id = ?1 AND c.last_change_id = ?7)`,
      params,
    },
  ];
  if (input.submit) {
    statements.push({
      sql: `INSERT INTO report_audit_events (id, occurred_at, actor_user_id, actor_grant_id, action, report_id, revision_id, from_state, to_state)
SELECT ?7, ?6, ?3, ?5, 'report.submit', ?1, c.current_revision_id, 'draft', 'in_review' FROM reports c WHERE c.id = ?1 AND c.last_change_id = ?7`,
      params,
    });
  }
  return statements;
}

/** The author, or an admin, discards a draft. */
export function discardStatements(input: {
  actor: ReportActor;
  reportId: string;
  version: number;
  changeId: string;
  now: Date;
}): SqlStatement[] {
  const params = [
    input.reportId,
    input.version,
    ...actorParams(input.actor),
    timestamp(input.now),
    input.changeId,
  ];
  return [
    {
      sql: `UPDATE reports SET state = 'discarded', version = version + 1, last_change_id = ?7, updated_at = ?6
WHERE id = ?1 AND state = 'draft' AND version = ?2 AND ${ACTIVE_GRANT} AND (author_user_id = ?3 OR ${ACTIVE_ADMIN})`,
      params,
    },
    {
      sql: `INSERT INTO report_audit_events (id, occurred_at, actor_user_id, actor_grant_id, action, report_id, revision_id, from_state, to_state)
SELECT ?7, ?6, ?3, ?5, 'report.discard', ?1, c.current_revision_id, 'draft', 'discarded' FROM reports c WHERE c.id = ?1 AND c.last_change_id = ?7`,
      params,
    },
  ];
}

/**
 * A member who is not the author decides on the revision in review. "Request
 * changes" copies that revision to a new open revision for the author.
 */
export function decideStatements(input: {
  actor: ReportActor;
  reportId: string;
  version: number;
  revisionId: string;
  decision: Decision;
  note: string | null;
  reviewId: string;
  newRevisionId: string;
  changeId: string;
  now: Date;
}): SqlStatement[] {
  const params = [
    input.reportId,
    input.version,
    ...actorParams(input.actor),
    timestamp(input.now),
    input.changeId,
    input.revisionId,
    input.decision,
    input.note,
    input.reviewId,
    input.newRevisionId,
  ];
  return [
    {
      sql: `UPDATE reports SET
  state = CASE ?9 WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'draft' END,
  current_revision_id = CASE ?9 WHEN 'request_changes' THEN ?12 ELSE current_revision_id END,
  version = version + 1, last_change_id = ?7, updated_at = ?6
WHERE id = ?1 AND state = 'in_review' AND version = ?2 AND current_revision_id = ?8
  AND author_user_id <> ?3 AND ${ACTIVE_GRANT}`,
      params,
    },
    {
      sql: `INSERT INTO report_reviews (id, report_id, revision_id, reviewer_user_id, reviewer_grant_id, decision, note, decided_at)
SELECT ?11, ?1, ?8, ?3, ?5, ?9, ?10, ?6 WHERE ${CHANGED}`,
      params,
    },
    {
      sql: `INSERT INTO report_revisions (id, report_id, number, title, account, observed_at, province, area, source_channel, created_at, updated_at)
SELECT ?12, r.report_id, r.number + 1, r.title, r.account, r.observed_at, r.province, r.area, r.source_channel, ?6, ?6
FROM report_revisions r WHERE r.id = ?8 AND ?9 = 'request_changes' AND ${CHANGED}`,
      params,
    },
    {
      sql: `INSERT INTO report_audit_events (id, occurred_at, actor_user_id, actor_grant_id, action, report_id, revision_id, from_state, to_state)
SELECT ?7, ?6, ?3, ?5, 'review.' || ?9, ?1, ?8, 'in_review', c.state FROM reports c WHERE c.id = ?1 AND c.last_change_id = ?7`,
      params,
    },
  ];
}

/** A change either happens completely or not at all. False means a conflict or no right. */
export type ChangeResult = { changed: boolean };

export async function createReport(
  db: ReportDb,
  actor: ReportActor,
  content: RevisionContent,
  now = new Date(),
): Promise<{ created: true; id: string } | { created: false; id: null }> {
  const reportId = newId();
  const [inserted] = await runBatch(
    db,
    createStatements({ actor, content, reportId, revisionId: newId(), changeId: newId(), now }),
  );
  return inserted === 1 ? { created: true, id: reportId } : { created: false, id: null };
}

export async function saveDraft(
  db: ReportDb,
  input: {
    actor: ReportActor;
    reportId: string;
    version: number;
    content: RevisionContent;
    submit?: boolean;
    now?: Date;
  },
): Promise<ChangeResult> {
  const [changed] = await runBatch(
    db,
    saveStatements({
      ...input,
      submit: input.submit ?? false,
      changeId: newId(),
      now: input.now ?? new Date(),
    }),
  );
  return { changed: changed === 1 };
}

export async function discardDraft(
  db: ReportDb,
  input: { actor: ReportActor; reportId: string; version: number; now?: Date },
): Promise<ChangeResult> {
  const [changed] = await runBatch(
    db,
    discardStatements({ ...input, changeId: newId(), now: input.now ?? new Date() }),
  );
  return { changed: changed === 1 };
}

export async function decideReview(
  db: ReportDb,
  input: {
    actor: ReportActor;
    reportId: string;
    version: number;
    revisionId: string;
    decision: Decision;
    note: string | null;
    now?: Date;
  },
): Promise<ChangeResult> {
  const [changed] = await runBatch(
    db,
    decideStatements({
      ...input,
      reviewId: newId(),
      newRevisionId: newId(),
      changeId: newId(),
      now: input.now ?? new Date(),
    }),
  );
  return { changed: changed === 1 };
}

// Reads

export type RevisionView = {
  id: string;
  number: number;
  title: string;
  account: string | null;
  observedAt: string | null;
  province: string | null;
  area: string | null;
  sourceChannel: SourceChannel | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
};

export type ReviewView = {
  id: string;
  revisionId: string;
  revisionNumber: number | null;
  reviewerName: string;
  reviewerIsViewer: boolean;
  decision: Decision;
  note: string | null;
  decidedAt: string;
};

export type EventView = {
  id: string;
  occurredAt: string;
  actorName: string;
  actorIsViewer: boolean;
  action: string;
  revisionNumber: number | null;
  fromState: ReportState | null;
  toState: ReportState;
};

export type ReportSummary = {
  id: string;
  state: ReportState;
  mine: boolean;
  authorName: string;
  title: string;
  province: string | null;
  area: string | null;
  observedAt: string | null;
  /** The last submission time, or null for a draft that was never submitted. */
  submittedAt: string | null;
  revisionNumber: number;
  updatedAt: string;
};

export type ReportView = {
  id: string;
  state: ReportState;
  version: number;
  mine: boolean;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  /**
   * True for an admin who reads a draft of another author that was never
   * submitted. The view then has the title and dates only.
   */
  metadataOnly: boolean;
  /** The author's open revision, or the last submitted revision for others. */
  shown: RevisionView;
  revisions: RevisionView[];
  reviews: ReviewView[];
  events: EventView[];
  /** The decision that returned this draft to the author, if any. */
  changesRequested: ReviewView | null;
  can: { edit: boolean; submit: boolean; discard: boolean; review: boolean };
};

type ReportRow = {
  id: string;
  state: ReportState;
  author_user_id: string;
  author_name: string | null;
  current_revision_id: string;
  version: number;
  created_at: string;
  updated_at: string;
};

type RevisionRow = {
  id: string;
  number: number;
  title: string;
  account: string | null;
  observed_at: string | null;
  province: string | null;
  area: string | null;
  source_channel: SourceChannel | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
};

type ReviewRow = {
  id: string;
  revision_id: string;
  reviewer_user_id: string;
  reviewer_name: string | null;
  decision: Decision;
  note: string | null;
  decided_at: string;
};

type EventRow = {
  id: string;
  occurred_at: string;
  actor_user_id: string;
  actor_name: string | null;
  action: string;
  revision_id: string;
  from_state: ReportState | null;
  to_state: ReportState;
};

const UNKNOWN_NAME = "Anggota tim";

function toRevision(row: RevisionRow): RevisionView {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    account: row.account,
    observedAt: row.observed_at,
    province: row.province,
    area: row.area,
    sourceChannel: row.source_channel,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submittedAt: row.submitted_at,
  };
}

async function all<T>(db: ReportDb, sql: string, ...values: unknown[]): Promise<T[]> {
  const { results } = await db
    .prepare(sql)
    .bind(...values)
    .all();
  return (results ?? []) as T[];
}

/**
 * Reads one report as `viewer` may see it, or null when the viewer may not see
 * it. Members see their own reports and every report that was submitted at
 * least once. Admins also see the title and dates of other members' drafts.
 */
export async function getReport(
  db: ReportDb,
  reportId: string,
  viewer: ReportViewer,
): Promise<ReportView | null> {
  const [report] = await all<ReportRow>(
    db,
    `SELECT r.id, r.state, r.author_user_id, u.name AS author_name, r.current_revision_id, r.version, r.created_at, r.updated_at
FROM reports r LEFT JOIN "user" u ON u.id = r.author_user_id WHERE r.id = ?1`,
    reportId,
  );
  if (!report) return null;
  const allRevisions = (
    await all<RevisionRow>(
      db,
      "SELECT * FROM report_revisions WHERE report_id = ?1 ORDER BY number",
      reportId,
    )
  ).map(toRevision);
  const mine = report.author_user_id === viewer.userId;
  const submitted = allRevisions.filter((revision) => revision.submittedAt !== null);
  const admin = viewer.role === "admin";
  if (!mine && submitted.length === 0 && !admin) return null;

  const metadataOnly = !mine && submitted.length === 0;
  const current = allRevisions.find((revision) => revision.id === report.current_revision_id);
  const lastSubmitted = submitted.at(-1);
  const shownSource = mine || metadataOnly ? current : lastSubmitted;
  if (!shownSource) return null;
  const shown: RevisionView = metadataOnly
    ? {
        ...shownSource,
        account: null,
        observedAt: null,
        province: null,
        area: null,
        sourceChannel: null,
      }
    : shownSource;
  const revisions = mine ? allRevisions : metadataOnly ? [] : submitted;
  const numbers = new Map(allRevisions.map((revision) => [revision.id, revision.number]));

  const reviews: ReviewView[] = (
    await all<ReviewRow>(
      db,
      `SELECT v.id, v.revision_id, v.reviewer_user_id, u.name AS reviewer_name, v.decision, v.note, v.decided_at
FROM report_reviews v LEFT JOIN "user" u ON u.id = v.reviewer_user_id WHERE v.report_id = ?1 ORDER BY v.decided_at, v.rowid`,
      reportId,
    )
  ).map((row) => ({
    id: row.id,
    revisionId: row.revision_id,
    revisionNumber: numbers.get(row.revision_id) ?? null,
    reviewerName: row.reviewer_name ?? UNKNOWN_NAME,
    reviewerIsViewer: row.reviewer_user_id === viewer.userId,
    decision: row.decision,
    note: row.note,
    decidedAt: row.decided_at,
  }));

  const events: EventView[] = (
    await all<EventRow>(
      db,
      `SELECT e.id, e.occurred_at, e.actor_user_id, u.name AS actor_name, e.action, e.revision_id, e.from_state, e.to_state
FROM report_audit_events e LEFT JOIN "user" u ON u.id = e.actor_user_id WHERE e.report_id = ?1 ORDER BY e.occurred_at, e.rowid`,
      reportId,
    )
  ).map((row) => ({
    id: row.id,
    occurredAt: row.occurred_at,
    actorName: row.actor_name ?? UNKNOWN_NAME,
    actorIsViewer: row.actor_user_id === viewer.userId,
    action: row.action,
    revisionNumber: numbers.get(row.revision_id) ?? null,
    fromState: row.from_state,
    toState: row.to_state,
  }));

  const draft = report.state === "draft";
  const lastReview = reviews.at(-1);
  return {
    id: report.id,
    state: report.state,
    version: report.version,
    mine,
    authorName: report.author_name ?? UNKNOWN_NAME,
    createdAt: report.created_at,
    updatedAt: report.updated_at,
    metadataOnly,
    shown,
    revisions,
    reviews,
    events,
    changesRequested:
      draft && lastReview?.decision === "request_changes" && !metadataOnly ? lastReview : null,
    can: {
      edit: mine && draft,
      submit: mine && draft,
      discard: draft && (mine || admin),
      review: report.state === "in_review" && !mine,
    },
  };
}

type SummaryRow = {
  id: string;
  state: ReportState;
  author_user_id: string;
  author_name: string | null;
  updated_at: string;
  cur_title: string;
  cur_number: number;
  cur_province: string | null;
  cur_area: string | null;
  cur_observed_at: string | null;
  sub_title: string | null;
  sub_number: number | null;
  sub_province: string | null;
  sub_area: string | null;
  sub_observed_at: string | null;
  sub_submitted_at: string | null;
};

/** Every report that `viewer` may see, newest change first. */
export async function listReports(db: ReportDb, viewer: ReportViewer): Promise<ReportSummary[]> {
  const rows = await all<SummaryRow>(
    db,
    `SELECT r.id, r.state, r.author_user_id, u.name AS author_name, r.updated_at,
  cur.title AS cur_title, cur.number AS cur_number, cur.province AS cur_province, cur.area AS cur_area, cur.observed_at AS cur_observed_at,
  sub.title AS sub_title, sub.number AS sub_number, sub.province AS sub_province, sub.area AS sub_area,
  sub.observed_at AS sub_observed_at, sub.submitted_at AS sub_submitted_at
FROM reports r
JOIN report_revisions cur ON cur.id = r.current_revision_id
LEFT JOIN "user" u ON u.id = r.author_user_id
LEFT JOIN report_revisions sub ON sub.id = (
  SELECT s.id FROM report_revisions s WHERE s.report_id = r.id AND s.submitted_at IS NOT NULL ORDER BY s.number DESC LIMIT 1)
WHERE r.author_user_id = ?1 OR sub.id IS NOT NULL OR ?2 = 'admin'
ORDER BY r.updated_at DESC, r.id
LIMIT 500`,
    viewer.userId,
    viewer.role,
  );
  return rows.map((row) => {
    const mine = row.author_user_id === viewer.userId;
    // Others see the last submitted revision. A never-submitted draft of another
    // author (admin only) shows its title only.
    const fromSubmitted = !mine && row.sub_title !== null;
    return {
      id: row.id,
      state: row.state,
      mine,
      authorName: row.author_name ?? UNKNOWN_NAME,
      title: fromSubmitted ? row.sub_title! : row.cur_title,
      province: mine ? row.cur_province : row.sub_province,
      area: mine ? row.cur_area : row.sub_area,
      observedAt: mine ? row.cur_observed_at : row.sub_observed_at,
      submittedAt: row.sub_submitted_at,
      revisionNumber: fromSubmitted ? row.sub_number! : row.cur_number,
      updatedAt: row.updated_at,
    };
  });
}
