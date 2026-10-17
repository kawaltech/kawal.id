---
status: accepted
date: 2026-10-17
---

# Private report drafts and two-person review

The user accepted this slice and all its recommendations on 17 October 2026.
This is the decision that step 1 of
[ADR 0007](0007-reliable-data-before-playback.md) requires. It adds no public
publication. Public field reports stay blocked under
[ADR 0002](0002-static-publication.md).

## Decision

A member writes a field report as a private draft. A different member reviews
one frozen revision and records a decision. All code, data, and pages are in
`apps/app` and D1. Nothing goes to `apps/public`, an export, or R2.

### Actors and permissions

A member is a person with an active `reviewer` or `admin` grant. This slice adds
no role.

- Every member can create a report, and edit, submit, or discard their own
  draft.
- **Two-person rule.** The reviewer of a revision must not be its author. Admins
  obey this rule too. Thus a first approval needs at least two active members.
- An open draft is private to its author. Other members see a report after its
  first submission, and then only its submitted revisions.
- An admin can discard any current draft of another author. This includes a
  draft that a reviewer returned with a change request. A discard needs no note.
- Visibility is a separate rule. An admin sees only the title and dates of
  another author's draft that was never submitted. An admin cannot edit or
  review another author's draft.
- A private save is not visible to other members. It does not change the
  report's version, its update time, or its place in a list.
- Each write checks the active grant again inside the D1 write. A revoked grant
  stops the next action.
- A revoked author cannot edit. Another member can still decide their submitted
  report. Decisions stay valid after the reviewer's grant is revoked.

### States

| From        | Action          | To          | Actor                 |
| ----------- | --------------- | ----------- | --------------------- |
| (none)      | create          | `draft`     | Member                |
| `draft`     | save            | `draft`     | Author                |
| `draft`     | submit          | `in_review` | Author                |
| `draft`     | discard         | `discarded` | Author or admin       |
| `in_review` | approve         | `approved`  | Member not the author |
| `in_review` | request changes | `draft`     | Member not the author |
| `in_review` | reject          | `rejected`  | Member not the author |

- Submit freezes the revision. Request changes copies it to a new open revision.
  The reviewed revision does not change.
- Request changes and reject need a note. Approve does not.
- `approved`, `rejected`, and `discarded` are terminal in this slice. A rejected
  report does not reopen; make a new report.
- **Approval means "content reviewed".** It is not a publication. Publication is
  a later, separate action with consent and public-copy checks.

### Stored data

Four tables in `apps/app/db/migrations/`:

- `reports`: state, author, current revision, a version that changes only with
  visible events, and a change marker for each D1 batch.
- `report_revisions`: title, account, observed time (UTC, shown in WIB),
  province from the fixed list of 38, kecamatan or desa text, source channel,
  and the author's save version. A submitted revision must have every field.
- `report_reviews`: one decision for each revision, with the reviewer's grant.
- `report_audit_events`: append-only. IDs, action, and states only.

Do not store reporter names, contact details, addresses, exact coordinates,
photos, or free-text source notes. These need consent and retention rules first.

### Audit

- Each state change writes exactly one audit event in the same D1 batch. A
  denied or failed attempt writes nothing.
- Audit events contain no report text and no review notes. A future erasure can
  remove content and keep the events.
- Draft saves write no event. The frozen revision is the record of what the
  reviewer read.
- Triggers reject UPDATE and DELETE on submitted revisions, reviews, and audit
  events. Read access is not logged.

### Interface

- Report pages use Indonesian labels and the option B design language. They load
  only `app/design/kawal.css` from the shared design, because the shared
  components import synthetic fixtures.
- Every report response is `private, no-store` and `noindex`. A report that a
  member may not see returns 404.

## Limits

- Until the owner accepts a D1-only backup, Time Travel, and restore drill under
  [ADR 0004](0004-void-static-deployment.md), only synthetic text goes into
  staging or production D1.
- Retention of discarded and rejected reports, and the erasure procedure, need a
  decision before real data.
- Remote migration, app deployment, and remote D1 writes need separate approval.
- Not in this slice: public submission, media, publication, withdrawal,
  correction of approved reports, reviewer assignment, notifications, and an
  invitation UI.

## References

- [Proposal and implementation](https://ampcode.com/threads/T-01a147a6-8b73-71d8-b65e-aafa9b8d630f)
- [Roadmap discussion](https://ampcode.com/threads/T-01a145d5-526c-7226-a388-20d220c2e184)
