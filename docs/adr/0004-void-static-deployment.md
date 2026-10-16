---
status: accepted
date: 2026-10-16
---

# Use the full native Void stack with separate public and editorial targets

The user chose the full Void stack, not React Router with the Void deploy CLI.
There are no product features or real records to migrate. Use native Void React
pages and loaders, Workers, D1, R2, and future native Void authentication. Keep
Vite+ and the accepted option B design. This replaces ADR 0001's stack and the
earlier deployment-only version of this decision. It closes ADR 0005.

## Two targets, one repository

- `apps/public`: native Void React, `output: "static"`, ISR disabled, and complete
  HTML plus `_void/pages/*.json` for every page. No API routes, authentication,
  middleware, crons, or queues. Do not add routing redirects, rewrites, or
  fallbacks that disable static navigation. Use native `Link` navigation.
- `apps/editorial`: native Void server output with Workers, D1, and R2. Use a
  separate host for future editorial requests. Keep all editorial responses
  `private, no-store`. Public reads must not call this target.
- Share design code in `app/design`. Keep option B at `/`, without field reports.
  Retain the review pages and their synthetic-data warnings until release work
  removes them. [ADR 0003](0003-map-and-table-public-design.md) still governs design.
- Pin Void and `@void/react` together. Each workspace must resolve the Vite+ core
  alias, not a second Vite installation. Node.js is the build and local tool
  runtime; the deployed editorial runtime is Workers.
- Local D1/R2 use separate Miniflare state per checkout. Normal setup, tests, and
  builds need no Google, NASA, or Cloudflare credentials. The user approved the
  public-only main deployment workflow and its first deployment. Editorial and
  unrelated remote changes need separate approval.

## Storage and future authentication

D1 is managed SQLite through async bindings. It is not a `better-sqlite3`
connection or a local file whose WAL, locks, and backup API we manage. R2 replaces
local production media files. Keep private originals and approved public copies
in separate storage boundaries. Future migrations must support overlapping
application versions. Review D1 batch/transaction behavior, backup retention,
Time Travel, and full database-plus-media restoration before accepting reports.
The root `migrations/0001-users.sql` is an immutable historical file, not an
editorial D1 migration. No replacement product schema exists yet.

Use native Void authentication when sign-in is built. Explicitly allow only
Google; disable email/password and account linking. Require an invitation or
reviewer approval. A Google sign-in alone must not grant reviewer rights. Keep
identity tied to the provider's stable subject, not just an email address. Test
callback validation, sessions, revocation, and role checks before release. Any
local test sign-in must be unavailable in production. Live Google checks need
development credentials and exact callback registration; foundation checks do not.

## Static safety and release limits

Void 1.1.11 can warn about a failed prerender and still exit successfully.
`scripts/check-public-build.mjs` must reject missing HTML/JSON and loader errors.
Do not turn the public target into a hybrid app: direct visits in a hybrid app
can execute loaders and query D1 even when navigation uses static JSON.

Direct-deploy SSG reads local Miniflare state, not production D1. Future public
generation must consume an approved-public export, with fixtures in orbs. Do not
point public loaders at the editorial database. [ADR 0002](0002-static-publication.md)
defines activation and withdrawal requirements.

Each public update is a deployment. Measure build and deployment time before
selecting a publication frequency. Serialize activation and prevent an older
export from replacing a newer export. The preview workflow serializes main runs
and skips superseded commits. This does not implement editorial publication,
approval, or withdrawal ordering.

Void's routing Worker runs before asset delivery, including code assets. It uses
compute quota and does not use the Cache API by default. Zone Cache Rules and
`s-maxage` or `stale-if-error` headers do not prove edge caching in this path.
The supported fallback is the last valid export with its timestamp, not a
promised 24-hour edge stale-on-error period. Measure caching and failure behavior
before release.

CLI rollback, dashboard rollback, and automatic readiness-failure restoration can
restore withdrawn content. Block real report publication until a withdrawal-safe
rollback procedure exists. ISR does not meet report withdrawal requirements.

## Current delivery boundary

This foundation implements neither sign-in nor reports, ingestion, publication,
withdrawal, or media processing. Caddy serves only the public static output for
local checks. Docker and Kamal are no longer the deployment plan.

The user approved automatic public-preview deployment after checks pass on main.
It reuses the checked static output and verifies the active version and HTTP
content on both public hosts. Editorial is excluded. The first native deployment
remains pending until the Actions secret is set and the workflow passes.
Do not treat a local build as a verified Worker handoff. The synthetic preview
exception does not lift the real report release gates in ADR 0002.

## References

- [Decision discussion](https://ampcode.com/threads/T-01a1447e-b3df-739d-82e4-48e8f72ea5ad)
- [Independent source review and local controls](https://ampcode.com/threads/T-01a145ab-fb67-71e4-abd1-a67b28dd4880)
- [Void pages](https://void.cloud/guide/pages-routing/overview)
- [D1](https://void.cloud/guide/database/d1)
- [Storage](https://void.cloud/guide/storage)
- [Direct Cloudflare deployment](https://void.cloud/integrations/cloudflare)
