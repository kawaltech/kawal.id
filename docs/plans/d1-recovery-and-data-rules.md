---
status: proposed
date: 2026-10-17
---

# D1 recovery and data rules

## Status and scope

This is the proposed recovery review for
[issue #3](https://github.com/kawaltech/kawal.id/issues/3). It is not owner
acceptance, permission for remote work, or proof of remote recovery. Real reports
remain blocked. Use synthetic text only until the owner accepts the decisions,
the required controls exist, and the isolated remote drill passes.

This plan covers the private text-report slice in PR #1 and all other tables in
`kawal-app-db`. It adds no code, migration, backup service, or retention job.
There is no R2/media workflow in this slice. R2 bindings do not prove media
recovery. A future media slice needs a separate database-plus-object procedure.
Public publication and withdrawal remain subject to ADR 0002.

Before adding media, define separate private-original and public-copy storage,
consent and retention, an object/version inventory linked to D1 revisions,
independent object recovery, and a coordinated recovery point. Test missing and
orphan objects, object erasure replay, and restoration without making private or
withdrawn files public. Verify missing-content responses on every controlled
hostname after rollback. A successful D1 restore cannot satisfy these checks.

Read together with [ADR 0004](../adr/0004-void-static-deployment.md),
[ADR 0006](../adr/0006-d1-read-replication-off.md), and
[operations](../operations.md). ADR 0008 and the report migration were read from
the pushed [PR #1 source](https://github.com/kawaltech/kawal.id/tree/a235996d27fdf361a0a0cef004c26b36620109b9).
They are not on this document's main base. This plan does not review or accept
PR #1, including its later, local privacy fix. The coordinator owns that work.

## 1. Verified Cloudflare documentation

The sources below were fetched on 17 October 2026. These are documented platform
facts, not measurements on this account. No live database, account setting,
record, or secret was read for this review.

| Fact                                                                                                                                                                                  | Source and consequence                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Time Travel overwrites the whole database in place. It cannot clone or fork a database into a new copy.                                                                               | [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/). It is not table-level repair or a preview restore.                                                                                                            |
| Time Travel is always on for the production storage backend. History and restores have no additional Time Travel charge.                                                              | Time Travel. The backend is identified by `version: production`, not by the application's staging/production label. The current remote backend was not checked here.                                                                      |
| History lasts 30 days on Workers Paid and 7 days on Workers Free.                                                                                                                     | Time Travel and [limits](https://developers.cloudflare.com/d1/platform/limits/). Confirm the account plan before making a retention promise. The page's general 30-day wording does not override the Free limit.                          |
| A database can have at most 10 restores per 10 minutes.                                                                                                                               | Limits. Include undo operations in the drill's restore budget.                                                                                                                                                                            |
| Recovery can select a minute in the retained history. Timestamps map to deterministic bookmarks.                                                                                      | Time Travel. A minute is recovery resolution, not a one-minute data-loss guarantee.                                                                                                                                                       |
| Restore cancels in-flight queries and transactions and returns an undo bookmark. Earlier bookmarks remain valid within retention.                                                     | Time Travel. Clients can receive errors. Undo is another destructive restore, not a safe way to reopen access.                                                                                                                            |
| Export produces SQL, with whole-database, table, schema-only, and data-only options. The documented export command has no bookmark or timestamp option.                               | [Wrangler D1 commands](https://developers.cloudflare.com/workers/wrangler/commands/d1/) and [import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/). Do not promise a non-destructive historical export. |
| A running export blocks other database requests. Export does not support databases with virtual tables. Numeric values can lose precision through JavaScript's number representation. | Import/export. Schedule an outage and test round-trip values. Do not delete production virtual tables to obtain an export.                                                                                                                |
| Imports need SQL, not a raw SQLite file. Import files have a documented 5 GiB limit in the import guide; individual SQL statements also have limits.                                  | Import/export and limits. Foreign-key order and D1-compatible statements matter. A readable local export does not prove a successful remote import.                                                                                       |
| D1 encrypts stored data and transport. Cloudflare manages the storage keys.                                                                                                           | [Data security](https://developers.cloudflare.com/d1/reference/data-security/). This does not encrypt a downloaded SQL file or give the app per-report key erasure.                                                                       |

The Time Travel, limits, import/export, and data-security pages show 21 April
2026 as their update date. The Wrangler command page shows 23 April 2026.
The [legacy backup page](https://developers.cloudflare.com/d1/reference/backups/)
announces removal of alpha snapshot-backup access on 1 July 2025. Do not use its
hourly snapshots, 24-hour retention, or `d1 backup` examples as this app's plan.

The Time Travel page links a Workflows/R2 export guide for longer storage. That
is a possible separate backup system, not a system installed in this app.
Time Travel alone does not provide an independent copy outside this database
and account. The reviewed pages do not establish a customer history-purge
mechanism, recovery after database deletion, or a recovery-time SLA. Do not
promise these. Treat database deletion or loss of account access as unrecoverable
under the proposed Time-Travel-only baseline unless separate evidence exists.

## 2. Recovery boundary and local evidence

All products that share `kawal-app-db` share one recovery point and outage.
Restoring a report can also undo a sign-out, a grant revocation, an invitation
claim, an erasure, and unrelated product writes. Schema and migration history
must match the Worker code before access opens. A Worker rollback alone does not
restore D1; a D1 restore does not roll back Worker code, secrets, or static files.

| Owner                     | Tables in the reviewed slice                                           |
| ------------------------- | ---------------------------------------------------------------------- |
| Platform                  | `_void_migrations`                                                     |
| Native Void / Better Auth | `user`, `session`, `account`, `verification`                           |
| Reviewer access           | `reviewer_invitations`, `reviewer_grants`, `reviewer_audit_events`     |
| Report review             | `reports`, `report_revisions`, `report_reviews`, `report_audit_events` |

Every future table needs an owner and a recovery check. Prefer separate databases
for future independent products. Separation limits recovery damage but requires
a new plan for cross-database dependencies; it is not part of this change.

### Evidence record

The prior worker saved local checkpoint `d2d91c2` on `d1-recovery-plan`, based on
main at [the checkpoint base](https://github.com/kawaltech/kawal.id/commit/8dc66a8db2b80a37afec6161245abbb3814e9c18).
The recovered files are `tests/d1-recovery.test.ts` and
`tests/support/d1-recovery.ts`. They need PR #1's schema. Main alone is not a
valid test target.

The original checkpoint reported 5/5 local drill tests and a 104/104 suite run
before the final two drill tests. The coordinator then recovered the exact local
PR privacy-fix commit `5390704cead61ce460e294a5f12ab05ef6180c55`, added the
diagnostic regression below, and ran `pnpm check` with both harness files.
That combined check passed: 107/107 tests in seven files, typecheck, lint, both
native builds, and the public guard's five complete HTML/JSON pairs. This is
local synthetic evidence, not remote Time Travel or deployment evidence.

The harness models restore by reading logical schema/data and later replacing
it in temporary Miniflare D1. This is not the remote Time Travel implementation.
Its five restore scenarios record these results:

- All modeled table row counts and fingerprints returned to the saved point.
  The named integrity triggers remained and rejected frozen-record changes.
  Later report changes and their audit events disappeared.
- SQL fixture files reproduced both modeled states. `node:sqlite` could read the
  saved SQL with matching row fingerprints. This is not a Wrangler export/import
  round trip.
- Copied cookies for a signed-out member and a revoked member got 401 before
  restore, then 200 after restore with the same secret and restored grants.
  Deleting sessions and replaying the revocation blocked those old sessions;
  a new sign-in for the revoked member got 403.
- In a separate runtime with a new auth secret, a copied old cookie got 401 even
  though session rows existed. A new sign-in worked. This does not test a live
  secret rollout or every auth artifact.
- Erased text in a never-submitted discarded draft returned after restore.
  Repeating the erasure removed it again. Submitted revisions and review notes
  rejected attempted changes under the current triggers.

The schema confirms that auth storage can contain Google access, refresh, and
ID tokens, and session IP/user-agent data. The prior worker reported observing
access/ID tokens in a synthetic sign-in inventory. This review confirms the
fields, not the contents of live accounts or retention of every token type.
Report audit events hold IDs/actions/states, not report text. Review notes and
reviewer-audit detail need separate privacy review; do not treat all audit data
as anonymous.

The coordinator also corrected a diagnostic gap. The old state/review check used
`NOT` over nullable left-join columns, so an approved/rejected report without a
review could escape the check. A new export-inspection test removes both reviews
from a disposable fixture and keeps the other report states as valid controls.
It failed on the old query: no invalid records were returned instead of both
records. Requiring a review ID in both terminal-state alternatives makes the
test pass. This sixth recovery test passed in the combined check above.
Whole-table fingerprints still cover the positive restore scenarios. The local
negative test does not replace a remote check on the final drill schema.

Not measured: remote duration, precise minute boundaries, cancellation under
concurrent traffic, undo, provider export/import fidelity, large databases,
history expiry, deleted-database recovery, or live auth-secret rollout.

## 3. Proposed recovery targets

These targets require owner acceptance and a measured drill. They are not SLAs.

- **Recovery point objective (RPO):** aim for the last known-good minute before
  the earliest damaging write. Select the point from evidence, not merely from
  the detection time. All later writes through the maintenance freeze can be
  lost, including valid writes. A one-minute resolution does not cap that loss;
  a fault found a day later can require a day's reconciliation.
- **Recovery time objective (RTO):** four staffed hours from incident declaration
  to safe private access, including containment, restore, access cleanup, erasure
  replay, and checks. Proposed staffed hours: 09:00–17:00 WIB, Monday–Friday,
  excluding owner-agreed holidays. Outside those hours, contain as soon as an
  operator is available and target recovery in the next staffed window. There
  is no 24-hour response promise without a named on-call operator.
- **Recovery history:** prefer Workers Paid's 30 days, subject to account-plan
  confirmation and privacy acceptance. Free provides only 7 days. Discovery
  outside the actual window cannot use Time Travel to that point.
- **Revocation/erasure record RPO:** no acknowledged request may be lost by a D1
  restore. Record durable intent outside D1 before acknowledgment. This is a
  required design target, not an implemented guarantee.

Recommend no scheduled full exports for this small slice initially. This avoids
uncontrolled extra copies of tokens and erased text, but accepts no independent
recovery for account loss, database deletion, or faults older than Time Travel.
If that risk is unacceptable, design an encrypted, independently held export
with a stated schedule, retention, restore test, and erasure replay first.
An approved pre-restore incident export can help manual reconciliation. It is
not an event log or proof that post-point writes are recoverable. Do not blindly
replay it: that can repeat the fault or reintroduce denied access and erased text.

## 4. Proposed retention and erasure rules

These are product choices for owner and qualified Indonesian privacy/legal
review. They are not legal advice, approved periods, or existing automated jobs.
The warning against names, contacts, addresses, and exact coordinates stays in
force. Free text can still contain personal data by mistake.

| Data                                                    | Proposed active-store rule                                                                                                     | Start point / condition                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Open drafts                                             | Notify the author after 90 inactive days; allow 30 days to keep the draft, then discard.                                       | Last edit; implement notice before automatic disposal.                                                      |
| Never-submitted discarded text                          | Redact text after 30 days.                                                                                                     | Discard time.                                                                                               |
| Rejected text and review notes                          | Redact content after 90 days.                                                                                                  | Terminal decision; an approved legal hold can defer this.                                                   |
| Superseded submitted revisions and request-change notes | Review at report closure; redact after 90 days unless a documented purpose needs longer.                                       | Terminal decision, not each revision creation.                                                              |
| Approved private text                                   | Review necessity at 12 months; renew for a stated purpose or redact. No indefinite default.                                    | Approval; approval is not publication consent.                                                              |
| Identity and grant linkage                              | Review for pseudonymization 90 days after access ends, while preserving valid authorship/audit links.                          | Last access grant ends; requires schema/auth review.                                                        |
| Closed invitation emails                                | Remove or replace with a non-identifying value after 30 days.                                                                  | Claim, revoke, or expiry; preserve only needed IDs and action history.                                      |
| Sessions and verification artifacts                     | Keep the existing 12-hour session lifetime; remove expired artifacts daily. End all sessions on recovery.                      | Auth expiry. No purge job is implemented.                                                                   |
| Google tokens, session IP/user-agent                    | Prefer not to retain them beyond the auth need. Confirm supported native auth settings and fresh sign-in behavior first.       | No application use of Google APIs is in this slice. Do not clear provider-subject identity with the tokens. |
| ID-only audit and recovery records                      | Review necessity yearly; keep recovery tombstones while any restorable copy can revive the target, plus a 7-day safety margin. | Latest possible copy expiry, not request time alone. IDs remain sensitive.                                  |
| Approved incident SQL exports                           | Delete after reconciliation and within 30 days.                                                                                | Export creation; log the deletion of each copy. A longer hold needs explicit review.                        |

An erasure request needs a verified requester, defined scope, due date, and an
operator. Treat a pending legal hold as an explicit, reviewed exception with an
expiry, not a permanent exemption. Do not silently extend retention because a
purge job fails. Report overdue work and block new sensitive intake if the
required controls cannot meet the accepted rule.

### Submitted content needs a new decision

ADR 0008 freezes submitted revisions, reviews, and report audit events. The
current triggers block both UPDATE and DELETE of submitted text/review notes;
required-field checks also prevent a simple NULL replacement. Discard is not
erasure, and approval is not permission to retain forever.

Choose one path before real reports:

1. **Recommended: controlled redaction.** Amend ADR 0008 and add a reviewed
   migration and operator procedure. Permit only a narrow, authorized redaction
   of content to a defined placeholder. Preserve report/revision IDs, decision
   links, and non-content events. Record who authorized the redaction and when,
   without copying erased text. Keep ordinary edits and event mutation blocked.
   Test repeat erasure and erasure after restore. Do not disable all triggers as
   a routine workaround. This work is not in the current PR.
2. **Alternative: per-report encryption with independent key deletion.** This
   needs a separate design for keys, restore, search, auth boundaries, and all
   copies. D1-managed storage encryption is not this design.
3. **Do not offer submitted-text erasure.** This leaves a major data-rights and
   accidental-disclosure risk. Do not accept real data on this basis without
   explicit owner and qualified legal acceptance; this review does not recommend it.

Live redaction cannot prove immediate removal from Time Travel history. Assume
old content remains recoverable for the full 30/7-day window after redaction,
and longer in any retained export. State this limit to the requester. Do not
promise secure byte erasure or history purge without provider evidence. The
external record must prevent restored text from becoming available again. A
restore or undo can bring old content into a newer recovery state; recalculate
the latest possible copy expiry after each such operation and redaction replay.

## 5. Database-independent recovery record

Before real intake, select and test a restricted, encrypted record outside
`kawal-app-db` and outside its restore process. A separate protected store with
independent access and recovery is preferred. A table, log, backup, or scheduled
export inside the same database does not meet this boundary. A public Git issue,
repository, chat transcript, or orb snapshot is not the store.

Keep an ordered, append-only record with:

- A unique event ID, sequence, schema version, request time in UTC, effective
  time, operator ID, authorization reference, scope, and action type.
- Report/revision IDs for erasure, invitation/grant/user IDs for access changes,
  and a stable identity match that survives an older restore or fresh sign-in.
  Prefer a keyed digest of the Google subject; use an email digest only where
  invitation matching needs it. Keep digest keys outside D1, with separate
  backup. Do not store raw email, provider tokens, cookies, IPs, user agents,
  report text, or review notes in this record. Digests and IDs are still private.
- Intent, completion/failure, and replay receipts. Include an explicit owner
  authorization for any later regrant or retention exception. A replay must not
  silently override a newer valid denial or erasure.
- A copy inventory: store, object/file identifier, creation time, source point,
  maximum retention, expiry, and deletion receipt. Do not include the SQL body.

Write durable intent first, then apply D1 changes, then record completion. The
stores cannot share one D1 transaction. If either step fails, leave the intent
pending, keep affected access/content closed, and reconcile with retries keyed
by event ID. Do not acknowledge completion until both results are verified.
Pending erasures and denials must apply during recovery too.

Before reopening after any restore, load the complete current effective record,
not only events dated after the selected point. Match targets that no longer
exist in the restored database and retain those tombstones for later sign-in or
import. An absent target is not permission to drop its denial. Replay must be
idempotent and ordered. Explicitly check restored open invitations and claimed
invitations: otherwise a revoked member can claim old permission again.

Retain effective access denials until explicitly superseded by an approved
regrant. Retain erasure tombstones until no retained recovery source can restore
their data, plus the safety margin. Review privacy and access yearly; do not
automatically remove an effective denial at 37 days. If the record or digest key
is missing, incomplete, or unreadable, keep access closed. Reconstruct from
independently verified decisions, not from the restored D1 audit alone.

## 6. Proposed incident procedure before access reopens

This is a runbook design. Each real incident needs approval for its named remote
actions, resource, point, outage, export destination, and secret changes. Nothing
in this document authorizes them.

1. **Contain.** Name the incident lead and each affected product owner. Close all
   app entry points, including sign-in/callback, protected reads, writes, admin
   tools, jobs, and any other Worker bound to the database. Stop automated app
   deployments and migration runners through an approved control. Leave the
   static public service independent; do not regenerate from restored private
   data. Verify the closure over HTTP, not only by a switch setting. A tested
   maintenance control does not yet exist in this slice.
2. **Select.** Record earliest known damage, the selected safe UTC point and WIB
   display, current point, database identity, active Worker version, schema,
   migration history, and replication setting. Keep replication disabled. Get
   all affected owners' approval of post-point loss and compatibility. Do not
   automatically rerun migrations on an unknown restored schema.
3. **Preserve only with approval.** If useful and safe, export the frozen current
   database to the approved encrypted incident store. Record its checksum and
   copy expiry. Treat all SQL as sensitive, including Google tokens. Do not put
   it in this repository, public R2, build assets, logs, or agent attachments.
   Failure to export is not permission to proceed without an explicit decision.
4. **Restore once.** Use the confirmed bookmark on the exact approved database.
   Keep all clients closed. Record output, times, and the returned undo bookmark
   outside D1. If the request times out or the connection fails, inspect state
   before retrying. An unknown response does not mean no restore occurred.
5. **Contain auth before reopening.** Prefer an approved rotation of
   `BETTER_AUTH_SECRET` to a fresh value in every app consumer, with no old-key
   fallback. Then delete all restored session and transient verification rows.
   Do not restore or roll back to the old secret. Rotation needs separate
   approval and a tested rollout; the local cookie test is not rollout proof.
   Reconcile/clear restored Google token fields through the approved auth-owner
   procedure. Secret rotation does not revoke Google-issued tokens; a suspected
   provider-token exposure needs a separate response. Preserve stable identity
   links required for denial matching.
6. **Replay restrictions and erasures.** Apply the external record, including
   pending intents, revoked grants/invitations, identity denials, and all content
   erasures. Current submitted-text triggers prevent this step for that content;
   until controlled redaction exists, recovery of such real data cannot pass.
   Keep fresh sign-in closed until revived invitations and grants are checked.
7. **Check every product.** Compare schema/index/trigger definitions and migration
   history; run foreign-key and explicit report/review/audit consistency checks,
   including missing links. Check expected row counts, erased-content absence,
   and effective denial records. Use saved point fingerprints only where replay
   has not intentionally changed rows. Do not print row content in evidence.
   Reconcile post-point valid work manually; never restore old sessions, grants,
   tokens, or erased text from the incident export. Record lost audit coverage
   outside D1 and add supported recovery events, without fabricating original
   event times or changing frozen audit records.
8. **Test access and accept.** All captured old cookies must fail. A fresh sign-in
   by a denied identity must not regain rights through a restored invitation.
   An allowed member must sign in again; verify two-person review and a normal
   report change. Confirm primary reads/replication off, private no-store
   responses, and erased text absent. Obtain a second operator's review and all
   affected owners' sign-off before reopening. Record actual RPO/RTO and notices
   to affected users. Unmet checks mean continued closure, not partial success.

If restore or checks fail, keep the app closed and escalate. Undo can restore
revoked access and erased content again; it must repeat auth cleanup, external
replay, compatibility checks, and acceptance. It is not an automatic fallback.
Do not reopen merely because database integrity passes. A database can be
internally consistent and still contain invalid permissions or erased text.

## 7. Isolated synthetic remote drill for later approval

No part of this procedure was run remotely. Do not use `kawal-app-db` as the drill
target or copy its records. Do not restore production to obtain a historical
test export. The approval must name the account, disposable database and Worker,
operator, cost ceiling, time window, permitted commands/writes, test-only auth
settings, secret-change scope, encrypted output location, and cleanup actions.
Any provisioning, deployment, deletion, or external auth setup needs explicit
inclusion. Do not use app `--provision`; keep read replication disabled.

1. Prepare a reviewed fixture on the final integrated schema. Include the
   missing-review negative case in the acceptance checks. Include
   every table, all report states, a request-change revision, two-person review,
   signed-out and revoked identities, revoked/open invitations, and erasure
   sentinels. Use only generated identities/tokens and non-deliverable addresses.
   Keep any auth substitute under test code, never in the production app.
2. After approval, verify the isolated resource ID against a deny-list containing
   production IDs. Confirm `version: production`, the account's retention plan,
   and replication disabled. Pin only the isolated binding in a separate config.
   Abort on any ambiguity. Do not read production to compare records.
3. Apply the reviewed migrations and synthetic state A. Store schema definitions,
   row counts/fingerprints, trigger names, consistency results, Worker version,
   and UTC/WIB times. Capture its current bookmark with Time Travel info. For a
   timestamp test, place A and B on distinct full minutes with known boundaries;
   record clock times rather than relying on a short sleep alone.
4. Make state B through the synthetic app or reviewed SQL: a later decision and
   report, sign-out, grant/invitation revocation, and erasure of an open draft.
   Record erasure/revocation intents in the isolated external record first.
   Verify old-cookie denial and erasure before restore. Export B to the approved
   synthetic output and verify its schema/data in a separate SQLite engine.
   Record export blocking/duration with isolated concurrent requests. Never use
   real traffic to measure the block.
5. Close the isolated app. Restore A by its bookmark. Record duration, returned
   undo bookmark, errors/cancelled test requests, and all state comparisons.
   Confirm B's report/audit events disappeared, all owners' tables reverted,
   and triggers still reject frozen updates. Expect access/text revival as a
   hazard, not as a passing security state. Verify that the latest Worker did
   not silently migrate the database before inspection.
6. Exercise undo to B while still closed. Confirm B comparisons and retained
   bookmark behavior. Restore A again, then run the approved isolated secret
   rotation, session/transient cleanup, and external replay. Check old-cookie
   failure, fresh denied-user failure, no invitation reclaim, allowed fresh
   sign-in, sentinel removal, and normal two-person review. Until submitted-text
   erasure exists, record that case as blocked, not as a successful drill.
7. In a separately approved empty disposable target, import the provider's SQL
   export and compare schema, indexes, triggers, migration metadata, counts,
   exact values, and consistency. Match auth/text sensitivity controls even for
   fixtures. Do not infer import fidelity from the local logical-copy harness.
   Use a separate timestamp restore to test the minute boundary if approved;
   do not exceed 10 restores per 10 minutes on a database. Undo uses that budget.
8. Record expected/actual results, exact revisions/tool versions, target IDs,
   elapsed times for containment/restore/remediation, export/import checksums,
   denials, negative tests, discrepancies, and remaining limits. Delete only
   approved disposable resources/copies, record cleanup, and verify production
   bindings/config were not changed. Do not publish secrets or SQL bodies in the
   result. A small fixture drill does not prove production-scale RTO or retention
   expiry; add representative-size and longer-window checks before such claims.

The owner must accept the evidence and any remaining risk after the drill.
Failure, partial cleanup, missing external records, or an untested erasure path
keeps real intake blocked.

## 8. Owner decisions and release gate

All decisions below are open. The accountable owner must name the operator,
second reviewer, privacy reviewer, and all co-owners of `kawal-app-db`.

| ID  | Decision required                             | Recommendation                                                                                              |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| D1  | Plan/history and residual loss risk           | Confirm Paid/30 days; accept or replace the Time-Travel-only baseline, including account/database loss.     |
| D2  | RPO, RTO, staffed hours, and outage authority | Accept section 3 with explicit post-point loss; do not promise one-minute maximum loss or 24-hour response. |
| D3  | Independent full exports                      | No scheduled exports initially; if independent disaster recovery is required, design it before intake.      |
| D4  | Auth recovery and token retention             | Approved fresh secret rollout plus session/transient cleanup; auth owner to confirm token minimization.     |
| D5  | External recovery record                      | Select a protected store, operator, keys, failure policy, and tested intent/replay procedure.               |
| D6  | Content erasure                               | Choose controlled redaction; amend ADR 0008 and implement/test before real data.                            |
| D7  | Retention and user notice                     | Accept or change every period in section 4; name job owners and review legal holds.                         |
| D8  | Identity/invitation minimization              | Decide supported pseudonymization, invitation-email cleanup, and stable denial matching.                    |
| D9  | Other products in this database               | Obtain their approval for recovery loss/outage; prefer separate databases for independent future products.  |
| D10 | Remote drill                                  | Approve a named isolated resource/action list later, then accept its measured results.                      |
| D11 | Legal/privacy review                          | Name a qualified Indonesian reviewer for retention, erasure delays, notices, and record location.           |

Required before real reports: accepted decisions; combined schema/harness/privacy
validation; implemented maintenance closure, redaction, cleanup and external
record; approved and accepted remote drill; operator access and copy-deletion
checks; and explicit final owner acceptance under ADR 0004/0008. Acceptance of
this document alone does not satisfy these implementation and evidence gates.
Public reporting, publication, withdrawal-safe rollback, and media need their
own later acceptance. Do not push, merge, deploy, export, restore, rotate secrets,
or change remote resources under this planning task.
