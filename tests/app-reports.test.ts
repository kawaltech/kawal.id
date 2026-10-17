// Private report drafts and reviewer review on the built Worker. Every member
// and every report is synthetic. Requests use the same JSON page-action
// protocol as the Void client.
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

const EVIL_ORIGIN = "https://evil.example";
// Text that must stay in report rows and never reach audit events.
const SENTINEL = "SINTETIS-asap-7c1e";

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

type Member = { jar: CookieJar; id: string; name: string };

/** Invite a synthetic member, sign in through the Google substitute, and claim. */
async function member(
  app: AppRuntime,
  db: D1Like,
  role: "reviewer" | "admin" = "reviewer",
): Promise<Member> {
  identities += 1;
  const identity = {
    sub: `synthetic-report-subject-${identities}`,
    email: `report-member-${identities}@example.test`,
    email_verified: true,
    name: `Anggota Sintetis ${identities}`,
  };
  await createInvitation(db as never, { email: identity.email, role, source: { via: "local" } });
  const { jar } = await signInWithGoogle(app, identity);
  // The first protected request claims the invitation.
  expect((await data(app, "/reports", jar)).status).toBe(200);
  const row = await db
    .prepare(`SELECT id FROM "user" WHERE email = ?`)
    .bind(identity.email)
    .first<{ id: string }>();
  return { jar, id: row!.id, name: identity.name };
}

/** A native client-navigation data request. */
function data(app: AppRuntime, path: string, jar?: CookieJar) {
  return app.fetch(path, { jar, headers: { "x-voidpages": "true", accept: "application/json" } });
}

/** A page action as the Void client sends it. */
function act(
  app: AppRuntime,
  path: string,
  jar: CookieJar | undefined,
  body: Record<string, string>,
  origin = APP_ORIGIN,
) {
  return app.fetch(path, {
    method: "POST",
    jar,
    origin,
    headers: {
      "x-voidpages": "true",
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

type PageJson = { props: { report?: ReportJson }; errors?: Record<string, string> | null };
type ReportJson = {
  id: string;
  state: string;
  version: number;
  draftVersion?: number | null;
  metadataOnly: boolean;
  shown: { id: string; number: number; title: string; account: string | null };
  revisions: { number: number }[];
  can: Record<string, boolean>;
};

async function report(app: AppRuntime, jar: CookieJar, id: string) {
  const response = await data(app, `/reports/${id}`, jar);
  expect(response.status).toBe(200);
  return ((await response.json()) as PageJson).props.report!;
}

const COMPLETE = {
  title: `Asap tebal di jalan desa ${SENTINEL}`,
  account: `Jarak pandang sekitar 50 meter sejak pagi. ${SENTINEL}`,
  observedAtWib: "2026-10-15T06:30",
  province: "Kalimantan Tengah",
  area: "Kecamatan Contoh Hilir",
  sourceChannel: "phone",
};

async function createDraft(app: AppRuntime, author: Member, title = COMPLETE.title) {
  const response = await act(app, "/reports/new", author.jar, { title });
  expect(response.status).toBe(303);
  const id = new URL(response.headers.get("location")!, APP_ORIGIN).pathname.split("/").pop()!;
  return id;
}

async function save(
  app: AppRuntime,
  author: Member,
  id: string,
  fields: Record<string, string>,
  intent: "save" | "submit" = "save",
) {
  return act(app, `/reports/${id}?save`, author.jar, {
    version: await draftVersion(app, author, id),
    intent,
    ...fields,
  });
}

/** The author's save token. */
async function draftVersion(app: AppRuntime, author: Member, id: string) {
  const view = await report(app, author.jar, id);
  return String(view.draftVersion ?? view.version);
}

/** What one member can read about reports: the list and one report, as page data. */
async function visible(app: AppRuntime, viewer: Member, id: string) {
  const list = (await (await data(app, "/reports", viewer.jar)).json()) as { props: unknown };
  return { list: list.props, report: await report(app, viewer.jar, id) };
}

async function decide(app: AppRuntime, reviewer: Member, id: string, decision: string, note = "") {
  const current = await report(app, reviewer.jar, id);
  return act(app, `/reports/${id}?decide`, reviewer.jar, {
    version: String(current.version),
    revisionId: current.shown.id,
    decision,
    note,
  });
}

async function rows<T>(db: D1Like, sql: string, ...values: unknown[]) {
  return (
    await db
      .prepare(sql)
      .bind(...values)
      .all<T>()
  ).results;
}

async function state(db: D1Like, id: string) {
  const row = await db
    .prepare("SELECT state, version FROM reports WHERE id = ?")
    .bind(id)
    .first<{ state: string; version: number }>();
  return row!;
}

async function events(db: D1Like, id: string) {
  return rows<Record<string, unknown>>(
    db,
    "SELECT * FROM report_audit_events WHERE report_id = ? ORDER BY occurred_at, rowid",
    id,
  );
}

async function expectConflict(response: Response) {
  expect(response.status).toBe(409);
  expect(response.headers.get("cache-control")).toMatch(/no-store/);
}

describe("report access", () => {
  test("anonymous and ungranted requests get no report data", async () => {
    const { app, db } = await createApp();
    const author = await member(app, db);
    const id = await createDraft(app, author);

    const visit = await app.fetch(`/reports/${id}`, {
      headers: { accept: "text/html", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" },
    });
    expect(visit.status).toBe(303);
    expect(visit.headers.get("location")).toBe("/sign-in");
    expect((await data(app, "/reports")).status).toBe(401);
    expect((await act(app, "/reports/new", undefined, { title: "x" })).status).toBe(401);

    // Signed in through Google, but without an invitation.
    const { jar } = await signInWithGoogle(app, {
      sub: "synthetic-uninvited",
      email: "uninvited@example.test",
      email_verified: true,
    });
    const pending = await data(app, `/reports/${id}`, jar);
    expect(pending.status).toBe(403);
    expect(await pending.text()).not.toContain(SENTINEL);
    expect((await act(app, "/reports/new", jar, { title: "x" })).status).toBe(403);
    expect(await rows(db, "SELECT id FROM reports")).toHaveLength(1);
  });

  test("an open draft is private to its author until the first submission", async () => {
    const { app, db } = await createApp();
    const author = await member(app, db);
    const other = await member(app, db);
    const id = await createDraft(app, author);

    expect((await data(app, `/reports/${id}`, other.jar)).status).toBe(404);
    const list = await (await data(app, "/reports", other.jar)).text();
    expect(list).not.toContain(SENTINEL);

    expect((await save(app, author, id, COMPLETE, "submit")).status).toBe(200);
    expect((await report(app, other.jar, id)).shown.title).toBe(COMPLETE.title);
  });

  test("an admin sees only the title of another author's unsubmitted draft and can discard it", async () => {
    const { app, db } = await createApp();
    const author = await member(app, db);
    const admin = await member(app, db, "admin");
    const other = await member(app, db);
    const id = await createDraft(app, author);
    expect((await save(app, author, id, { ...COMPLETE })).status).toBe(200);

    const response = await data(app, `/reports/${id}`, admin.jar);
    const body = await response.text();
    expect(body).not.toContain(COMPLETE.account);
    expect(body).not.toContain(COMPLETE.area);
    const view = (JSON.parse(body) as PageJson).props.report!;
    expect(view.metadataOnly).toBe(true);
    expect(view.can).toMatchObject({ edit: false, review: false, discard: true });

    // The accepted exception shows the title and dates. A later private save
    // that keeps the title changes nothing that the admin can read.
    const before = await visible(app, admin, id);
    expect((await save(app, author, id, { ...COMPLETE, area: "Desa Contoh Lain" })).status).toBe(
      200,
    );
    expect(await visible(app, admin, id)).toEqual(before);

    // A reviewer who is not the author cannot see or discard it.
    const version = String(view.version);
    expect((await act(app, `/reports/${id}?discard`, other.jar, { version })).status).toBe(404);
    expect((await state(db, id)).state).toBe("draft");

    expect((await act(app, `/reports/${id}?discard`, admin.jar, { version })).status).toBe(200);
    expect((await state(db, id)).state).toBe("discarded");
    const [, discard] = await events(db, id);
    expect(discard).toMatchObject({ action: "report.discard", actor_user_id: admin.id });
  });

  test("a grant revoked after the page load stops the next action", async () => {
    const { app, db } = await createApp();
    const author = await member(app, db);
    const reviewer = await member(app, db);
    const admin = await member(app, db, "admin");
    const id = await createDraft(app, author);
    await save(app, author, id, COMPLETE, "submit");
    const loaded = await report(app, reviewer.jar, id);

    await revokeGrant(db as never, { targetUserId: reviewer.id, actorUserId: admin.id });
    const response = await act(app, `/reports/${id}?decide`, reviewer.jar, {
      version: String(loaded.version),
      revisionId: loaded.shown.id,
      decision: "approve",
      note: "",
    });
    expect([401, 403]).toContain(response.status);
    expect(await state(db, id)).toEqual({ state: "in_review", version: loaded.version });
    expect(await rows(db, "SELECT id FROM report_reviews")).toHaveLength(0);
    expect((await events(db, id)).map((event) => event.action)).toEqual([
      "report.create",
      "report.submit",
    ]);
  });

  test("a cross-origin action changes nothing", async () => {
    const { app, db } = await createApp();
    const author = await member(app, db);
    const id = await createDraft(app, author);
    const version = String((await report(app, author.jar, id)).version);
    const response = await act(app, `/reports/${id}?discard`, author.jar, { version }, EVIL_ORIGIN);
    expect([401, 403]).toContain(response.status);
    expect((await state(db, id)).state).toBe("draft");
  });
});

describe("report workflow", () => {
  test("draft, request changes, resubmit, and approve one exact revision", async () => {
    const { app, db } = await createApp();
    const author = await member(app, db);
    const reviewer = await member(app, db);
    const id = await createDraft(app, author);

    // A submission needs every field. The draft stays a draft.
    const incomplete = await save(app, author, id, { title: COMPLETE.title }, "submit");
    expect(incomplete.status).toBe(200);
    const errors = ((await incomplete.json()) as PageJson).errors!;
    expect(Object.keys(errors).sort()).toEqual([
      "account",
      "area",
      "observedAtWib",
      "province",
      "sourceChannel",
    ]);
    expect((await state(db, id)).state).toBe("draft");

    expect((await save(app, author, id, COMPLETE, "submit")).status).toBe(200);
    expect((await state(db, id)).state).toBe("in_review");
    // The author cannot change a submitted revision or review it.
    await expectConflict(await save(app, author, id, { ...COMPLETE, title: "Ubah" }));
    await expectConflict(await decide(app, author, id, "approve"));

    // Request changes needs a note.
    const noNote = await decide(app, reviewer, id, "request_changes");
    expect(((await noNote.json()) as PageJson).errors).toHaveProperty("note");
    expect((await state(db, id)).state).toBe("in_review");

    const note = "Sebutkan sumber bau asap.";
    expect((await decide(app, reviewer, id, "request_changes", note)).status).toBe(200);
    const returned = await report(app, author.jar, id);
    expect(returned.state).toBe("draft");
    expect(returned.shown.number).toBe(2);
    const [first, second] = await rows<Record<string, unknown>>(
      db,
      "SELECT * FROM report_revisions WHERE report_id = ? ORDER BY number",
      id,
    );
    // Revision 2 is a copy; revision 1 keeps exactly what the reviewer read.
    expect(second).toMatchObject({
      title: first!.title,
      account: first!.account,
      submitted_at: null,
    });
    expect(first!.submitted_at).not.toBeNull();

    const corrected = { ...COMPLETE, account: `${COMPLETE.account} Bau seperti kayu terbakar.` };
    expect((await save(app, author, id, corrected, "submit")).status).toBe(200);
    expect((await decide(app, reviewer, id, "approve")).status).toBe(200);
    expect((await state(db, id)).state).toBe("approved");

    const reviews = await rows<Record<string, unknown>>(
      db,
      "SELECT revision_id, decision, note, reviewer_user_id FROM report_reviews WHERE report_id = ? ORDER BY decided_at, rowid",
      id,
    );
    expect(reviews).toEqual([
      { revision_id: first!.id, decision: "request_changes", note, reviewer_user_id: reviewer.id },
      { revision_id: second!.id, decision: "approve", note: null, reviewer_user_id: reviewer.id },
    ]);

    const trail = await events(db, id);
    expect(
      trail.map((event) => [event.action, event.actor_user_id, event.from_state, event.to_state]),
    ).toEqual([
      ["report.create", author.id, null, "draft"],
      ["report.submit", author.id, "draft", "in_review"],
      ["review.request_changes", reviewer.id, "in_review", "draft"],
      ["report.submit", author.id, "draft", "in_review"],
      ["review.approve", reviewer.id, "in_review", "approved"],
    ]);
    expect(JSON.stringify(trail)).not.toContain(SENTINEL);
    expect(JSON.stringify(trail)).not.toContain(note);

    // An approved report accepts no more actions.
    await expectConflict(await decide(app, reviewer, id, "reject", "Terlambat."));
    await expectConflict(
      await act(app, `/reports/${id}?discard`, author.jar, {
        version: String((await state(db, id)).version),
      }),
    );
  });

  test("an admin cannot review their own report", async () => {
    const { app, db } = await createApp();
    const admin = await member(app, db, "admin");
    const id = await createDraft(app, admin);
    await save(app, admin, id, COMPLETE, "submit");
    await expectConflict(await decide(app, admin, id, "approve"));
    expect((await state(db, id)).state).toBe("in_review");
  });

  test("a save with an old version changes nothing", async () => {
    const { app, db } = await createApp();
    const author = await member(app, db);
    const id = await createDraft(app, author);
    const version = await draftVersion(app, author, id);
    const first = { ...COMPLETE, title: "Judul pertama" };
    expect(
      (await act(app, `/reports/${id}?save`, author.jar, { version, intent: "save", ...first }))
        .status,
    ).toBe(200);
    await expectConflict(
      await act(app, `/reports/${id}?save`, author.jar, {
        version,
        intent: "save",
        ...COMPLETE,
        title: "Judul kedua",
      }),
    );
    expect((await report(app, author.jar, id)).shown.title).toBe("Judul pertama");
  });

  test("private saves on a returned draft change nothing that other members see", async () => {
    const { app, db } = await createApp();
    const author = await member(app, db);
    const reviewer = await member(app, db);
    const admin = await member(app, db, "admin");
    const returned = await createDraft(app, author);
    await save(app, author, returned, COMPLETE, "submit");
    await decide(app, reviewer, returned, "request_changes", "Periksa jam pengamatan.");
    // A later visible change on another report puts that report first in the list.
    const later = await createDraft(app, admin, "Laporan lain yang dikirim kemudian");
    await save(app, admin, later, { ...COMPLETE, title: "Laporan lain" }, "submit");

    const reviewerBefore = await visible(app, reviewer, returned);
    const adminBefore = await visible(app, admin, returned);
    for (const account of ["Perbaikan pertama.", "Perbaikan kedua, belum dikirim."]) {
      expect((await save(app, author, returned, { ...COMPLETE, account })).status).toBe(200);
    }
    expect((await report(app, author.jar, returned)).shown.account).toBe(
      "Perbaikan kedua, belum dikirim.",
    );
    expect(await visible(app, reviewer, returned)).toEqual(reviewerBefore);
    expect(await visible(app, admin, returned)).toEqual(adminBefore);

    // The admin's discard uses the version the admin read before the saves.
    expect(
      (
        await act(app, `/reports/${returned}?discard`, admin.jar, {
          version: String(adminBefore.report.version),
        })
      ).status,
    ).toBe(200);
    expect((await state(db, returned)).state).toBe("discarded");
  });

  test("two concurrent decisions on one revision record exactly one", async () => {
    const { app, db } = await createApp();
    const author = await member(app, db);
    const one = await member(app, db);
    const two = await member(app, db);
    const id = await createDraft(app, author);
    await save(app, author, id, COMPLETE, "submit");
    const loaded = await report(app, one.jar, id);
    const body = (decision: string) => ({
      version: String(loaded.version),
      revisionId: loaded.shown.id,
      decision,
      note: "Catatan sintetis.",
    });
    const responses = await Promise.all([
      act(app, `/reports/${id}?decide`, one.jar, body("approve")),
      act(app, `/reports/${id}?decide`, two.jar, body("reject")),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const reviews = await rows<{ decision: string }>(db, "SELECT decision FROM report_reviews");
    expect(reviews).toHaveLength(1);
    const decisionEvents = (await events(db, id)).filter((event) =>
      String(event.action).startsWith("review."),
    );
    expect(decisionEvents).toHaveLength(1);
    expect((await state(db, id)).state).toBe(
      reviews[0]!.decision === "approve" ? "approved" : "rejected",
    );
  });

  test("submitted revisions, reviews, and audit events cannot be changed in the database", async () => {
    const { app, db } = await createApp();
    const author = await member(app, db);
    const reviewer = await member(app, db);
    const id = await createDraft(app, author);
    await save(app, author, id, COMPLETE, "submit");
    await decide(app, reviewer, id, "request_changes", "Perlu waktu yang lebih tepat.");

    // The open copy can change; the submitted revision cannot.
    const open = db.prepare(
      "UPDATE report_revisions SET title = 'x' WHERE report_id = ? AND submitted_at IS NULL",
    );
    await expect(open.bind(id).run()).resolves.toBeDefined();
    for (const statement of [
      "UPDATE report_revisions SET title = 'x' WHERE report_id = ? AND submitted_at IS NOT NULL",
      "DELETE FROM report_revisions WHERE report_id = ? AND submitted_at IS NOT NULL",
      "UPDATE report_reviews SET note = 'x' WHERE report_id = ?",
      "DELETE FROM report_reviews WHERE report_id = ?",
      "UPDATE report_audit_events SET to_state = 'approved' WHERE report_id = ?",
      "DELETE FROM report_audit_events WHERE report_id = ?",
    ]) {
      await expect(db.prepare(statement).bind(id).run(), statement).rejects.toThrow();
    }
  });
});

describe("report responses", () => {
  test("report text is escaped, and every report response is private, no-store, and noindex", async () => {
    const { app, db } = await createApp();
    const author = await member(app, db);
    const id = await createDraft(app, author, `<script>alert(1)</script> ${SENTINEL}`);

    const html = await app.fetch(`/reports/${id}`, {
      jar: author.jar,
      headers: { accept: "text/html", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" },
    });
    expect(html.status).toBe(200);
    const text = await html.text();
    expect(text).toContain(SENTINEL);
    expect(text).not.toContain("<script>alert(1)</script>");

    const responses: [string, Response][] = [
      ["page", html],
      ["list data", await data(app, "/reports", author.jar)],
      ["report data", await data(app, `/reports/${id}`, author.jar)],
      ["new data", await data(app, "/reports/new", author.jar)],
      ["save action", await save(app, author, id, { title: "Judul baru" })],
      ["missing report", await data(app, "/reports/does-not-exist", author.jar)],
    ];
    for (const [label, response] of responses) {
      expect(response.headers.get("cache-control"), label).toMatch(/private/);
      expect(response.headers.get("cache-control"), label).toMatch(/no-store/);
      expect(response.headers.get("x-robots-tag"), label).toMatch(/noindex/);
    }
  });
});
