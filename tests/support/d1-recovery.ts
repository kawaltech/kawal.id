// Synthetic D1 recovery drill support. It models a database-wide restore as a
// logical copy: read every table, index, trigger, and row at one time, and later
// replace the whole database with that copy in place. This is a local model of
// the restore boundary, not Cloudflare Time Travel. It does not prove remote
// restoration, its duration, or in-flight query behavior.
//
// The same module can inspect a SQL export file without D1, through
// `node:sqlite`. Use only synthetic data:
//
//   node tests/support/d1-recovery.ts <export.sql>
//
// It prints table owners, row counts, row fingerprints, and consistency
// results as JSON. It changes no database.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { D1Like } from "./app-runtime.ts";

/**
 * The owner of each table in `kawal-app-db`. A restore changes all of them at
 * once. A new table without an entry here fails the drill.
 */
export const TABLE_OWNERS: Readonly<Record<string, string>> = {
  _void_migrations: "platform (Void migration history)",
  user: "auth (native Void / Better Auth)",
  session: "auth (native Void / Better Auth)",
  account: "auth (native Void / Better Auth)",
  verification: "auth (native Void / Better Auth)",
  reviewer_invitations: "reviewer access",
  reviewer_grants: "reviewer access",
  reviewer_audit_events: "reviewer access",
  reports: "report review (ADR 0008)",
  report_revisions: "report review (ADR 0008)",
  report_reviews: "report review (ADR 0008)",
  report_audit_events: "report review (ADR 0008)",
};

/** The integrity triggers from the report review migration. */
export const INTEGRITY_TRIGGERS = [
  "report_audit_events_no_delete",
  "report_audit_events_no_update",
  "report_reviews_no_delete",
  "report_reviews_no_update",
  "report_revisions_frozen_delete",
  "report_revisions_frozen_update",
];

/**
 * Read-only checks. Each query returns the rows that break one rule, so an
 * empty result is a pass. They use only standard SQLite, so the same queries
 * can run on a remote drill database after approval.
 */
export const CONSISTENCY_CHECKS: Readonly<Record<string, string>> = {
  "report current revision exists in the same report": `
SELECT r.id FROM reports r LEFT JOIN report_revisions v
  ON v.id = r.current_revision_id AND v.report_id = r.id WHERE v.id IS NULL`,
  "report state agrees with its current revision and review": `
SELECT r.id, r.state FROM reports r
JOIN report_revisions v ON v.id = r.current_revision_id
LEFT JOIN report_reviews w ON w.revision_id = v.id
WHERE NOT (
  (r.state IN ('draft', 'discarded') AND v.submitted_at IS NULL AND w.id IS NULL) OR
  (r.state = 'in_review' AND v.submitted_at IS NOT NULL AND w.id IS NULL) OR
  (r.state = 'approved' AND w.id IS NOT NULL AND w.decision = 'approve') OR
  (r.state = 'rejected' AND w.id IS NOT NULL AND w.decision = 'reject'))`,
  "report state agrees with its last audit event": `
SELECT r.id, r.state, e.to_state FROM reports r
JOIN report_audit_events e ON e.rowid = (
  SELECT x.rowid FROM report_audit_events x WHERE x.report_id = r.id
  ORDER BY x.occurred_at DESC, x.rowid DESC LIMIT 1)
WHERE e.to_state <> r.state`,
  "every report has a create event": `
SELECT r.id FROM reports r WHERE NOT EXISTS (
  SELECT 1 FROM report_audit_events e WHERE e.report_id = r.id AND e.action = 'report.create')`,
  "every review refers to a submitted revision of its report": `
SELECT w.id FROM report_reviews w LEFT JOIN report_revisions v
  ON v.id = w.revision_id AND v.report_id = w.report_id
WHERE v.id IS NULL OR v.submitted_at IS NULL`,
  "every audit event refers to a known report and revision": `
SELECT e.id FROM report_audit_events e
WHERE NOT EXISTS (SELECT 1 FROM reports r WHERE r.id = e.report_id)
   OR NOT EXISTS (SELECT 1 FROM report_revisions v WHERE v.id = e.revision_id AND v.report_id = e.report_id)`,
  "every report author and reviewer had a grant": `
SELECT 'author' AS role, r.id FROM reports r
WHERE NOT EXISTS (SELECT 1 FROM reviewer_grants g WHERE g.user_id = r.author_user_id)
UNION ALL
SELECT 'reviewer', w.id FROM report_reviews w
WHERE NOT EXISTS (SELECT 1 FROM reviewer_grants g WHERE g.id = w.reviewer_grant_id AND g.user_id = w.reviewer_user_id)`,
  "no reviewer decided their own report": `
SELECT w.id FROM report_reviews w JOIN reports r ON r.id = w.report_id
WHERE w.reviewer_user_id = r.author_user_id`,
  "every grant refers to an existing user": `
SELECT g.id FROM reviewer_grants g
WHERE NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = g.user_id)`,
};

/** Statements that reproduce the database. Tables are in parent-first order. */
export type Snapshot = Awaited<ReturnType<typeof snapshot>>;

type Row = Record<string, unknown>;

interface Reader {
  all(sql: string): Promise<Row[]>;
}

function d1Reader(db: D1Like) {
  return { all: async (sql: string) => (await db.prepare(sql).all<Row>()).results };
}

const SCHEMA_SQL = `SELECT type, name, tbl_name, sql FROM sqlite_master
WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY rowid`;

function quoteName(name: string) {
  return `"${name.replaceAll('"', '""')}"`;
}

function literal(value: unknown) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`;
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : (value as Uint8Array);
    return `X'${Buffer.from(bytes).toString("hex")}'`;
  }
  throw new Error(`Unsupported value in snapshot: ${typeof value}`);
}

async function parentFirst(reader: Reader, tables: string[]) {
  const parents = new Map<string, Set<string>>();
  for (const table of tables) {
    const keys = await reader.all(`PRAGMA foreign_key_list(${quoteName(table)})`);
    parents.set(table, new Set(keys.map((key) => String(key.table)).filter((p) => p !== table)));
  }
  const ordered: string[] = [];
  const visit = (table: string, path: Set<string>) => {
    if (ordered.includes(table)) return;
    if (path.has(table)) throw new Error(`Foreign key cycle at ${table}`);
    path.add(table);
    for (const parent of parents.get(table) ?? []) if (tables.includes(parent)) visit(parent, path);
    ordered.push(table);
  };
  for (const table of tables) visit(table, new Set());
  return ordered;
}

async function snapshotWith(reader: Reader) {
  const objects = await reader.all(SCHEMA_SQL);
  const tables = await parentFirst(
    reader,
    objects.filter((o) => o.type === "table").map((o) => String(o.name)),
  );
  const create = (type: string) =>
    objects.filter((o) => o.type === type).map((o) => `${String(o.sql)};`);
  const statements = ["PRAGMA defer_foreign_keys = ON;"];
  for (const table of tables) {
    statements.push(String(objects.find((o) => o.name === table)!.sql) + ";");
  }
  for (const table of tables) {
    // Keep row order, so that rowid order (used to break audit time ties) survives.
    for (const row of await reader.all(`SELECT * FROM ${quoteName(table)} ORDER BY rowid`)) {
      const columns = Object.keys(row);
      statements.push(
        `INSERT INTO ${quoteName(table)} (${columns.map(quoteName).join(", ")}) VALUES (${columns
          .map((column) => literal(row[column]))
          .join(", ")});`,
      );
    }
  }
  statements.push(...create("index"), ...create("trigger"));
  return { tables, statements };
}

/** Read the complete schema and data at this moment. */
export function snapshot(db: D1Like) {
  return snapshotWith(d1Reader(db));
}

/** Statements as one SQL file, without BEGIN or COMMIT. */
export function sqlFile(statements: string[]) {
  return statements.join("\n") + "\n";
}

/**
 * Replace the whole database with a snapshot in one D1 batch. Like an in-place
 * restore, it removes every table, row, index, and trigger that is not in the
 * snapshot, and it keeps the same Worker, secret, and binding.
 */
export async function restoreInPlace(db: D1Like, value: Snapshot) {
  const current = await d1Reader(db).all(SCHEMA_SQL);
  const drop = [
    ...current
      .filter((o) => o.type === "trigger")
      .map((o) => `DROP TRIGGER ${quoteName(String(o.name))}`),
    ...(
      await parentFirst(
        d1Reader(db),
        current.filter((o) => o.type === "table").map((o) => String(o.name)),
      )
    )
      .reverse()
      .map((table) => `DROP TABLE ${quoteName(table)}`),
  ];
  await db.batch(
    ["PRAGMA defer_foreign_keys = ON", ...drop, ...value.statements.slice(1)].map((sql) =>
      db.prepare(sql),
    ),
  );
}

/** Rows of every table, keyed by primary key, for a change file. */
export interface TableRows {
  keys: Record<string, string[]>;
  rows: Record<string, Map<string, Row>>;
}

/** Read every row of every table with its primary key columns. */
export async function tableRows(db: D1Like) {
  const reader = d1Reader(db);
  const objects = await reader.all(SCHEMA_SQL);
  const result: TableRows = { keys: {}, rows: {} };
  for (const table of objects.filter((o) => o.type === "table").map((o) => String(o.name))) {
    const info = await reader.all(`PRAGMA table_info(${quoteName(table)})`);
    const keys = info
      .filter((c) => Number(c.pk) > 0)
      .sort((a, b) => Number(a.pk) - Number(b.pk))
      .map((c) => String(c.name));
    if (keys.length === 0) throw new Error(`${table} has no primary key`);
    result.keys[table] = keys;
    result.rows[table] = new Map(
      (await reader.all(`SELECT * FROM ${quoteName(table)} ORDER BY rowid`)).map((row) => [
        JSON.stringify(keys.map((key) => row[key])),
        row,
      ]),
    );
  }
  return result;
}

/**
 * Data statements that change `before` into `after`: DELETE, UPDATE, and
 * INSERT by primary key, with parent tables first for inserts. Both states
 * must have the same schema. A remote drill can apply the result after its
 * restore point, as ordinary application writes would.
 */
export function changeStatements(before: TableRows, after: TableRows, order: string[]) {
  const where = (table: string, row: Row) =>
    before.keys[table]!.map((key) => `${quoteName(key)} = ${literal(row[key])}`).join(" AND ");
  const deletes: string[] = [];
  const writes: string[] = [];
  for (const table of order) {
    const old = before.rows[table] ?? new Map<string, Row>();
    const now = after.rows[table] ?? new Map<string, Row>();
    for (const [key, row] of old) {
      if (!now.has(key))
        deletes.unshift(`DELETE FROM ${quoteName(table)} WHERE ${where(table, row)};`);
    }
    for (const [key, row] of now) {
      const previous = old.get(key);
      if (!previous) {
        const columns = Object.keys(row);
        writes.push(
          `INSERT INTO ${quoteName(table)} (${columns.map(quoteName).join(", ")}) VALUES (${columns
            .map((column) => literal(row[column]))
            .join(", ")});`,
        );
      } else {
        const changed = Object.keys(row).filter((column) => row[column] !== previous[column]);
        if (changed.length > 0) {
          writes.push(
            `UPDATE ${quoteName(table)} SET ${changed
              .map((column) => `${quoteName(column)} = ${literal(row[column])}`)
              .join(", ")} WHERE ${where(table, previous)};`,
          );
        }
      }
    }
  }
  return [...deletes, ...writes];
}

export interface Inspection {
  owners: Record<string, string | null>;
  rows: Record<string, number>;
  fingerprints: Record<string, string>;
  triggers: string[];
  violations: Record<string, Row[]>;
  foreignKeyErrors: Row[];
}

async function inspectWith(reader: Reader) {
  const objects = await reader.all(SCHEMA_SQL);
  const tables = objects
    .filter((o) => o.type === "table")
    .map((o) => String(o.name))
    .sort();
  const inspection: Inspection = {
    owners: {},
    rows: {},
    fingerprints: {},
    triggers: objects
      .filter((o) => o.type === "trigger")
      .map((o) => String(o.name))
      .sort(),
    violations: {},
    foreignKeyErrors: await reader.all("PRAGMA foreign_key_check"),
  };
  for (const table of tables) {
    inspection.owners[table] = TABLE_OWNERS[table] ?? null;
    // Order by every column, so the fingerprint does not depend on rowid.
    const columns = (await reader.all(`PRAGMA table_info(${quoteName(table)})`)).map((c) =>
      quoteName(String(c.name)),
    );
    const rows = await reader.all(
      `SELECT * FROM ${quoteName(table)} ORDER BY ${columns.join(", ")}`,
    );
    inspection.rows[table] = rows.length;
    const hash = createHash("sha256");
    for (const row of rows) hash.update(JSON.stringify(Object.entries(row)) + "\n");
    inspection.fingerprints[table] = hash.digest("hex");
  }
  if (tables.includes("reports")) {
    for (const [name, sql] of Object.entries(CONSISTENCY_CHECKS)) {
      inspection.violations[name] = await reader.all(sql);
    }
  }
  return inspection;
}

/** Owners, row counts, fingerprints, triggers, and rule violations. */
export function inspect(db: D1Like) {
  return inspectWith(d1Reader(db));
}

/**
 * Load a SQL export into a temporary in-memory SQLite database and inspect it.
 * This checks the content of an export file. It does not prove that D1 can
 * import or restore that file.
 */
export async function inspectSqlFile(sql: string) {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("BEGIN");
    database.exec(sql);
    database.exec("COMMIT");
    return await inspectWith({
      all: async (query) => database.prepare(query).all() as Row[],
    });
  } finally {
    database.close();
  }
}

if (import.meta.main) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node tests/support/d1-recovery.ts <export.sql>");
    process.exit(2);
  }
  const result = await inspectSqlFile(readFileSync(file, "utf8"));
  console.log(JSON.stringify(result, null, 2));
  const failed =
    Object.values(result.owners).includes(null) ||
    Object.values(result.violations).some((rows) => rows.length > 0) ||
    result.foreignKeyErrors.length > 0;
  process.exit(failed ? 1 : 0);
}
