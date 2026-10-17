---
status: accepted
date: 2026-10-17
---

# Keep D1 read replication off for the app database

Keep read replication disabled on the app D1 database `kawal-app-db`
(`8f362e20-3ba6-468d-8681-ed0fb9f597ee`). The user confirmed this on 17 October 2026. This decision adds to the storage rules in
[ADR 0004](0004-void-static-deployment.md).

## Context

D1 read replication keeps read-only copies of the database in other regions. A
copy can be a short time behind the primary database. To read from a copy safely,
Worker code must use the D1 Sessions API. Cloudflare marks the feature as beta.

Each protected request reads the session row and the reviewer grant:

- Void's native Better Auth reads sessions through `void/db`, with
  `first-unconstrained`. This mode can read from a copy.
- `getAppIdentity` and the reviewer guard read from the primary database
  (`first-primary`).

With replication on, a session read can use a copy that is behind. Then a user
who signed out, or whose session was revoked, can still get access for a short
time.

## Decision

- Read replication stays disabled on `kawal-app-db`.
- Do not turn it on in the Cloudflare dashboard or through the API.
- Do not let Void provision this database. Void 1.1.11 sets
  `read_replication: { mode: "auto" }` each time it provisions a D1 database.
  Thus never run `void deploy --provision` for the app. Keep the D1 ID pinned in
  `apps/app/void.config.ts`. Without the pin, a deployment provisions the
  database.
- After each app deployment, read the D1 settings and confirm that
  `read_replication.mode` is `disabled`.

## Consequences

- Each read goes to the primary database in APAC. Sign-out and revocation apply
  on the next request.
- Users far from APAC can have slower reads. Measure this before you change the
  decision.
- To turn replication on later, make a new ADR. First make every session and
  grant read use the primary database, or use the Sessions API with a bookmark
  from the write. Then test that sign-out and revocation apply on the next
  request on a test database. Do not test on `kawal-app-db`.

## References

- [App staging](../app-staging.md)
- [D1 read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/)
