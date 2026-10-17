// Synthetic D1 recovery drill on the built Worker. It models a database-wide
// restore of `kawal-app-db` in local Miniflare D1. It does not prove Cloudflare
// Time Travel. Every member and report is synthetic. See
// docs/plans/d1-recovery-and-data-rules.md.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vite-plus/test";
import { createInvitation, revokeGrant } from "../apps/app/lib/reviewer-store.ts";
import {
  APP_ORIGIN,
  CookieJar,
  buildApp,
  signInWithGoogle,
  startApp,
  type AppBuild,
  type AppRuntime,
  type D1Like,
} from "./support/app-runtime.ts";
import {
  INTEGRITY_TRIGGERS,
  TABLE_OWNERS,
  changeStatements,
  inspect,
  inspectSqlFile,
  restoreInPlace,
  snapshot,
  sqlFile,
  tableRows,
  type Inspection,
} from "./support/d1-recovery.ts";

const run = promisify(execFile);
// Synthetic text that a restore can bring back.
const SENTINEL = "SINTETIS-pemulihan-4b2d";

let build: AppBuild;
const runtimes: AppRuntime[] = [];

beforeAll(async () => {
  build = await buildApp();
}, 180_000);

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()));
});

afterAll(async () => {
  await build?.dispose();
});

async function createApp() {
  const runtime = await startApp(build);
  runtimes.push(runtime);
  await runtime.migrate();
  return { app: runtime, db: await runtime.database() };
}

let identities = 0;
type Member = Awaited<ReturnType<typeof member>>;

async function member(app: AppRuntime, db: D1Like, role: "reviewer" | "admin" = "reviewer") {
  identities += 1;
  const identity = {
    sub: `synthetic-recovery-subject-${identities}`,
    email: `recovery-member-${identities}@example.test`,
    email_verified: true,
    name: `Anggota Sintetis ${identities}`,
  };
  await createInvitation(db as never, { email: identity.email, role, source: { via: "local" } });
  const { jar } = await signInWithGoogle(app, identity);
  expect((await data(app, "/reports", jar)).status).toBe(200);
  const row = await db
    .prepare(`SELECT id FROM "user" WHERE email = ?`)
    .bind(identity.email)
    .first<{ id: string }>();
  return { jar, id: row!.id, identity };
}

function data(app: AppRuntime, path: string, jar?: CookieJar) {
  return app.fetch(path, { jar, headers: { "x-voidpages": "true", accept: "application/json" } });
}

function act(app: AppRuntime, path: string, jar: CookieJar, body: Record<string, string>) {
  return app.fetch(path, {
    method: "POST",
    jar,
    origin: APP_ORIGIN,
    headers: {
      "x-voidpages": "true",
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

type ReportJson = { version: number; state: string; shown: { id: string } };

async function view(app: AppRuntime, jar: CookieJar, id: string) {
  const response = await data(app, `/reports/${id}`, jar);
  expect(response.status).toBe(200);
  return ((await response.json()) as { props: { report: ReportJson } }).props.report;
}

const CONTENT = {
  title: `Asap di tepi kanal ${SENTINEL}`,
  account: `Bau asap sejak subuh. ${SENTINEL}`,
  observedAtWib: "2026-10-15T06:30",
  province: "Riau",
  area: "Kecamatan Contoh Hulu",
  sourceChannel: "messaging",
};

async function draft(app: AppRuntime, author: Member) {
  const response = await act(app, "/reports/new", author.jar, { title: CONTENT.title });
  expect(response.status).toBe(303);
  return new URL(response.headers.get("location")!, APP_ORIGIN).pathname.split("/").pop()!;
}

async function submit(app: AppRuntime, author: Member, id: string) {
  const version = String((await view(app, author.jar, id)).version);
  const response = await act(app, `/reports/${id}?save`, author.jar, {
    version,
    intent: "submit",
    ...CONTENT,
  });
  expect(response.status).toBe(200);
}

async function decide(app: AppRuntime, reviewer: Member, id: string, decision: string) {
  const current = await view(app, reviewer.jar, id);
  const note = decision === "approve" ? "" : `Catatan sintetis. ${SENTINEL}`;
  const response = await act(app, `/reports/${id}?decide`, reviewer.jar, {
    version: String(current.version),
    revisionId: current.shown.id,
    decision,
    note,
  });
  expect(response.status).toBe(200);
}

async function discard(app: AppRuntime, author: Member, id: string) {
  const version = String((await view(app, author.jar, id)).version);
  expect((await act(app, `/reports/${id}?discard`, author.jar, { version })).status).toBe(200);
}

async function stateOf(db: D1Like, id: string) {
  return (await db.prepare("SELECT state FROM reports WHERE id = ?").bind(id).first<{
    state: string;
  }>())!.state;
}

async function count(db: D1Like, sql: string, ...values: unknown[]) {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM ${sql}`)
    .bind(...values)
    .first<{ n: number }>();
  return row!.n;
}

function expectHealthy(result: Inspection) {
  expect(Object.entries(result.owners).filter(([, owner]) => owner === null)).toEqual([]);
  expect(result.foreignKeyErrors).toEqual([]);
  for (const [rule, rows] of Object.entries(result.violations)) {
    expect({ rule, rows }).toEqual({ rule, rows: [] });
  }
  expect(result.triggers).toEqual(expect.arrayContaining(INTEGRITY_TRIGGERS));
}

async function signOut(app: AppRuntime, jar: CookieJar) {
  const response = await app.fetch("/api/auth/sign-out", {
    method: "POST",
    jar,
    origin: APP_ORIGIN,
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  expect(response.status).toBe(200);
}

/** A report fixture in every state of ADR 0008, before the restore point. */
async function reportsInEveryState(app: AppRuntime, db: D1Like) {
  const author = await member(app, db);
  const reviewer = await member(app, db);
  const admin = await member(app, db, "admin");
  const open = await draft(app, author);
  const inReview = await draft(app, author);
  await submit(app, author, inReview);
  const approved = await draft(app, author);
  await submit(app, author, approved);
  await decide(app, reviewer, approved, "approve");
  const rejected = await draft(app, author);
  await submit(app, author, rejected);
  await decide(app, reviewer, rejected, "reject");
  const returned = await draft(app, author);
  await submit(app, author, returned);
  await decide(app, reviewer, returned, "request_changes");
  const discarded = await draft(app, author);
  await discard(app, author, discarded);
  return {
    author,
    reviewer,
    admin,
    ids: { open, inReview, approved, rejected, returned, discarded },
  };
}

describe("database-wide restore drill (local model, synthetic)", () => {
  test("export diagnostics detect approved and rejected reports without reviews", async () => {
    const { app, db } = await createApp();
    const { ids } = await reportsInEveryState(app, db);
    expectHealthy(await inspect(db));

    // Model an incomplete export. The other report states remain valid controls.
    await db.prepare("DROP TRIGGER report_reviews_no_delete").run();
    await db
      .prepare("DELETE FROM report_reviews WHERE report_id IN (?, ?)")
      .bind(ids.approved, ids.rejected)
      .run();
    const result = await inspectSqlFile(sqlFile((await snapshot(db)).statements));
    expect(
      result.violations["report state agrees with its current revision and review"]
        .map((row) => row.id)
        .sort(),
    ).toEqual([ids.approved, ids.rejected].sort());
  }, 120_000);

  test("a restore returns every table to the restore point and keeps integrity controls", async () => {
    const { app, db } = await createApp();
    const { author, reviewer, ids } = await reportsInEveryState(app, db);
    const atRestorePoint = await inspect(db);
    expectHealthy(atRestorePoint);
    // The restore scope is the whole database: auth, reviewer, report, and
    // Void migration tables. Every table has a named owner.
    expect(Object.keys(atRestorePoint.owners).sort()).toEqual(Object.keys(TABLE_OWNERS).sort());
    expect(atRestorePoint.rows).toMatchObject({ reports: 6, report_reviews: 3 });
    const point = await snapshot(db);

    // Writes after the restore point.
    await decide(app, reviewer, ids.inReview, "approve");
    await discard(app, author, ids.open);
    const late = await draft(app, author);
    const changed = await inspect(db);
    expectHealthy(changed);
    expect(changed.fingerprints).not.toEqual(atRestorePoint.fingerprints);

    await restoreInPlace(db, point);
    const restored = await inspect(db);
    expectHealthy(restored);
    // Every table, including sessions and grants, equals the restore point.
    expect(restored.fingerprints).toEqual(atRestorePoint.fingerprints);
    expect(restored.rows).toEqual(atRestorePoint.rows);

    // Every write after the restore point is lost, its audit events included.
    expect(await count(db, "reports WHERE id = ?", late)).toBe(0);
    expect(await stateOf(db, ids.inReview)).toBe("in_review");
    expect(await stateOf(db, ids.open)).toBe("draft");
    expect(await count(db, "report_audit_events WHERE report_id = ?", late)).toBe(0);
    expect(
      await count(
        db,
        "report_audit_events WHERE report_id = ? AND action = 'review.approve'",
        ids.inReview,
      ),
    ).toBe(0);

    // The restored triggers still reject changes to frozen records.
    await expect(
      db
        .prepare(
          "UPDATE report_revisions SET title = 'x' WHERE report_id = ? AND submitted_at IS NOT NULL",
        )
        .bind(ids.approved)
        .run(),
    ).rejects.toThrow(/submitted revision does not change/);
    await expect(
      db.prepare("DELETE FROM report_reviews WHERE report_id = ?").bind(ids.rejected).run(),
    ).rejects.toThrow(/append-only/);
    await expect(
      db.prepare("DELETE FROM report_audit_events WHERE report_id = ?").bind(ids.approved).run(),
    ).rejects.toThrow(/append-only/);

    // The app works on the restored data: the lost decision can be made again.
    expect((await view(app, reviewer.jar, ids.inReview)).state).toBe("in_review");
    await decide(app, reviewer, ids.inReview, "approve");
    expectHealthy(await inspect(db));
  }, 120_000);

  test("drill files reproduce both states, also outside D1", async () => {
    const { app, db } = await createApp();
    const { author, reviewer, admin, ids } = await reportsInEveryState(app, db);
    const point = await snapshot(db);
    const before = { rows: await tableRows(db), inspection: await inspect(db) };

    // The same kinds of writes as in the other scenarios, after the point.
    await decide(app, reviewer, ids.inReview, "approve");
    await discard(app, author, ids.open);
    await draft(app, author);
    await signOut(app, author.jar);
    expect(
      (await revokeGrant(db as never, { targetUserId: reviewer.id, actorUserId: admin.id }))
        .revoked,
    ).toBe(true);
    const after = { rows: await tableRows(db), inspection: await inspect(db) };
    const changes = changeStatements(before.rows, after.rows, point.tables);

    // The change file turns the restored point into the later state again.
    await restoreInPlace(db, point);
    expect((await inspect(db)).fingerprints).toEqual(before.inspection.fingerprints);
    await db.batch(changes.map((sql) => db.prepare(sql)));
    expect((await inspect(db)).fingerprints).toEqual(after.inspection.fingerprints);

    const output = process.env.KAWAL_DRILL_OUTPUT;
    const directory = output ?? (await mkdtemp(join(tmpdir(), "kawal-recovery-")));
    try {
      await mkdir(directory, { recursive: true });
      const file = join(directory, "state-a.sql");
      await writeFile(file, sqlFile(point.statements));
      await writeFile(join(directory, "changes-b.sql"), sqlFile(changes));
      await writeFile(
        join(directory, "expected.json"),
        JSON.stringify({ a: before.inspection, b: after.inspection }, null, 2) + "\n",
      );
      // A second SQLite engine reads the same file and gets the same result.
      const { stdout } = await run(process.execPath, ["tests/support/d1-recovery.ts", file]);
      const outside = JSON.parse(stdout) as Inspection;
      expect(outside.fingerprints).toEqual(before.inspection.fingerprints);
      expect(outside.triggers).toEqual(before.inspection.triggers);
    } finally {
      if (!output) await rm(directory, { recursive: true, force: true });
    }
  }, 120_000);

  test("a new auth secret makes restored session rows useless", async () => {
    const secret = "synthetic-secret-".padEnd(64, "a");
    const first = await startApp(build, { bindings: { BETTER_AUTH_SECRET: secret } });
    runtimes.push(first);
    await first.migrate();
    const firstDb = await first.database();
    const signedOut = await member(first, firstDb);
    const copied = signedOut.jar.clone();
    const point = await snapshot(firstDb);

    // The same restored rows with the same secret: the copied cookie works.
    const same = await startApp(build, { bindings: { BETTER_AUTH_SECRET: secret } });
    runtimes.push(same);
    await restoreInPlace(await same.database(), point);
    expect((await data(same, "/reports", copied.clone())).status).toBe(200);

    // The same restored rows with a new secret: no restored session works.
    const rotated = await startApp(build, {
      bindings: { BETTER_AUTH_SECRET: "synthetic-secret-".padEnd(64, "b") },
    });
    runtimes.push(rotated);
    const rotatedDb = await rotated.database();
    await restoreInPlace(rotatedDb, point);
    expect(await count(rotatedDb, `"session"`)).toBeGreaterThan(0);
    expect((await data(rotated, "/reports", copied.clone())).status).toBe(401);
    // A new sign-in works with the new secret.
    expect(
      (await data(rotated, "/reports", (await signInWithGoogle(rotated, signedOut.identity)).jar))
        .status,
    ).toBe(200);
  }, 120_000);

  test("a restore brings back ended sessions and revoked grants until remediation", async () => {
    const { app, db } = await createApp();
    const admin = await member(app, db, "admin");
    const signedOut = await member(app, db);
    const revoked = await member(app, db);
    // A copy of the cookie as it was before sign-out: another device, a
    // browser that missed the response, or a copied cookie.
    const copied = signedOut.jar.clone();
    const point = await snapshot(db);

    await signOut(app, signedOut.jar);
    expect(
      (await revokeGrant(db as never, { targetUserId: revoked.id, actorUserId: admin.id })).revoked,
    ).toBe(true);
    // Check with copies: a denied response also clears the cookie in a jar.
    expect((await data(app, "/reports", copied.clone())).status).toBe(401);
    expect((await data(app, "/reports", revoked.jar.clone())).status).toBe(401);

    await restoreInPlace(db, point);
    // Hazard: the restored rows give access again on the next request.
    expect((await data(app, "/reports", copied)).status).toBe(200);
    expect((await data(app, "/reports", revoked.jar)).status).toBe(200);
    expect(
      await count(db, "reviewer_grants WHERE user_id = ? AND revoked_at IS NULL", revoked.id),
    ).toBe(1);
    expect(await count(db, "reviewer_audit_events WHERE action = 'grant.revoke'")).toBe(0);

    // Remediation before the app opens again: end every session, then apply
    // the revocations that were recorded outside the database after the point.
    await db.prepare(`DELETE FROM "session"`).run();
    const ledger = [{ targetUserId: revoked.id, actorUserId: admin.id }];
    for (const entry of ledger) {
      expect((await revokeGrant(db as never, entry)).revoked).toBe(true);
    }
    expect(await count(db, `"session"`)).toBe(0);
    for (const jar of [copied, revoked.jar, admin.jar]) {
      expect((await data(app, "/reports", jar)).status).toBe(401);
    }
    // Members sign in again. The revoked member gets no access.
    expect(
      (await data(app, "/reports", (await signInWithGoogle(app, revoked.identity)).jar)).status,
    ).toBe(403);
    expect(
      (await data(app, "/reports", (await signInWithGoogle(app, signedOut.identity)).jar)).status,
    ).toBe(200);
  }, 120_000);

  test("an erasure after the restore point returns with the restore; frozen text cannot be erased now", async () => {
    const { app, db } = await createApp();
    const { author, reviewer } = await reportsInEveryState(app, db);
    const discarded = await draft(app, author);
    await discard(app, author, discarded);
    const rejected = await draft(app, author);
    await submit(app, author, rejected);
    await decide(app, reviewer, rejected, "reject");
    const point = await snapshot(db);

    // The current triggers block erasure of submitted text and review notes.
    await expect(
      db
        .prepare(
          "UPDATE report_revisions SET title = '[dihapus]', account = NULL WHERE report_id = ?",
        )
        .bind(rejected)
        .run(),
    ).rejects.toThrow(/submitted revision does not change/);
    await expect(
      db
        .prepare("UPDATE report_reviews SET note = '[dihapus]' WHERE report_id = ?")
        .bind(rejected)
        .run(),
    ).rejects.toThrow(/append-only/);

    // A discarded draft that was never submitted has only an open revision,
    // which the triggers do not protect. Its text can be erased in place.
    const erase = (id: string) =>
      db
        .prepare(
          `UPDATE report_revisions SET title = '[dihapus]', account = NULL, observed_at = NULL,
             province = NULL, area = NULL, source_channel = NULL
           WHERE report_id = ? AND submitted_at IS NULL`,
        )
        .bind(id)
        .run();
    await erase(discarded);
    const textOf = (id: string) =>
      count(
        db,
        "report_revisions WHERE report_id = ? AND (title LIKE ? OR account LIKE ?)",
        id,
        `%${SENTINEL}%`,
        `%${SENTINEL}%`,
      );
    expect(await textOf(discarded)).toBe(0);
    const erasureLedger = [discarded];

    await restoreInPlace(db, point);
    // Hazard: the erased text is back.
    expect(await textOf(discarded)).toBe(1);
    // Remediation: apply the erasure ledger again before the app opens.
    for (const id of erasureLedger) await erase(id);
    expect(await textOf(discarded)).toBe(0);
    // The audit events have no report text, so they stay as they were.
    const audit = await db.prepare("SELECT * FROM report_audit_events").all();
    expect(JSON.stringify(audit.results)).not.toContain(SENTINEL);
    expectHealthy(await inspect(db));
  }, 120_000);
});
