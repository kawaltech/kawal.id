---
status: accepted
date: 2026-10-16
---

# Build Kawal Asap as one self-contained application

Kawal Asap needs a small system that each Amp orb can run independently.
Use React Router, Node.js, Vite+, SQLite, and local files.
Use Kamal to deploy one application container to one server with persistent storage.

## Context

The project has a new direction. The existing application and older plans do not
constrain this work. Start from a new application structure. Do not migrate the
old sample data unless a separate requirement makes it necessary.

Each orb must support development and tests without a shared database, production
credentials, or a hosted authentication service.

## Decision

| Part | Choice |
| --- | --- |
| Application | React Router Framework Mode, React, and TypeScript |
| Runtime | Node.js |
| Development tools | Vite+ with pinned Node.js and pnpm versions |
| Database | SQLite with SQL migrations and write-ahead logging (WAL) |
| Production sign-in | Google OpenID Connect; local sessions and roles in SQLite |
| Media | Local files; separate private originals from published copies |
| Deployment | Docker and Kamal on one server |
| Persistent storage | A local host directory mounted at `/data` |

Keep pages, form actions, sessions, and server logic in one application. Do not
add a separate API service, Redis, a queue, or a hosted database initially.

Select compatible framework and tool versions together. The old version pins are
not requirements. Keep React Router's development, build, and type-generation
commands. Use `vp run` to run framework scripts. Do not assume that the built-in
`vp build` command replaces `react-router build`.

Each orb gets its own SQLite database, media directory, and synthetic test data.
Tests use source-data fixtures by default. Live ingestion needs a separate key.
Do not put production reports, private media, or production secrets in snapshots.

### Google sign-in

Use a maintained OpenID Connect library for the server-side authorization code
flow. Validate the ID token signature, issuer, audience, expiry, and nonce.
Check the request state and use PKCE. Keep the client secret on the server.
Request only the identity information needed for sign-in. Do not request Google
Drive access or refresh tokens for sign-in alone.

Identify a Google account by its issuer and subject identifier (`sub`). Do not
use an email address as the permanent identity key. Keep reviewer roles in
SQLite. Google sign-in must not grant reviewer access without an invitation or
approval. Do not link accounts only because their email addresses match.

Store sessions locally. Use secure, HTTP-only cookies with a suitable SameSite
policy. Rotate the session after sign-in. Support session expiry, logout, and
access removal. Keep session secrets stable across deployments. Existing sessions
can continue during a Google outage until local policy requires sign-in again.
New Google sign-ins require Google to be available.

Use separate development and production OAuth clients. Google requires an exact
registered callback URL and does not permit wildcard callback URLs. A new orb
portal needs callback registration only for a live Google integration check.
Normal development and tests use local test identities without Google credentials.
The test sign-in path must be unavailable in production. Test callback validation
with controlled responses, and verify the real flow before release.

### Orb setup

Update `.agents/setup` for the new toolchain and local data setup. Setup must be
non-interactive and safe to repeat. Resume must not reinstall dependencies.
Verify the tools in a clean login shell and in a supervised application service.

## Alternatives not selected

- **Supabase and PostgreSQL:** They provide useful hosted services and spatial
  queries. They also add services that independent orbs do not need. Reconsider
  PostgreSQL with PostGIS only if measured spatial work exceeds the SQLite design.
- **Bun as the runtime:** Its built-in tools and SQLite API are useful. Node.js
  with Vite+ gives us one tool interface without a Bun-specific database API.
- **Vercel Functions:** A local SQLite database and local media need persistent
  storage. A single server fits this requirement without a remote storage service.
- **An upgrade of the old application:** There is no working reporting system to
  preserve. A new structure avoids work that serves only the old plan.

## Consequences

- Keep write transactions short. SQLite permits one writer at a time. WAL does
  not remove this limit. Set a bounded busy timeout and handle write conflicts.
  Use transactions and constraints to prevent duplicate publication. Prevent
  overlapping ingestion runs, including runs from old and new containers.
- Index public queries before adding caches. Cache only approved public data.
  Set expiry times and remove affected cache entries after corrections or
  withdrawals. Private originals must not enter public caches.
- Vite+ task caches reduce repeated development work. They do not replace
  application caches, durable storage, or backups.
- Keep the database and media outside the container image. A deployment must not
  replace them. Mount the whole database directory so SQLite can use its WAL files.
- Old and new containers can overlap during deployment. Use migrations that work
  with both versions. Run migrations once with a defined lock and failure path.
  A migration must not require a lock held by an old container that cannot stop
  until the new container becomes healthy. An image rollback does not reverse a
  database migration.
- Make consistent database backups and media backups. Keep copies off the server
  and test restoration. Do not copy a live SQLite file as a backup. Retain the
  media referenced by each database backup until that backup expires. A persistent
  volume is not a backup.
- One server is an accepted initial limit. It is not a high-availability design.
  Server maintenance, disk capacity, access control, and recovery remain our work.

## Proposed delivery order

The stack above is accepted. The following product sequence remains a proposal.

The proposed product needs durable reports, controlled publication, and private
source media. [ADR 0002](0002-static-publication.md) defines the accepted static
public read path and cache rules. It replaces the initial per-request access
check with export removal and cache expiry or purge.

1. Build a fresh application and prove orb setup. Test report submission, review,
   and publication with fixtures. Unreviewed reports must not be public.
2. Test one NASA FIRMS NOAA-20 or NOAA-21 VIIRS feed. Verify deduplication, time
   windows, and recovery after failures. Retain the last valid data with a stale
   label. Unavailable data must not appear as zero detections.
3. Add a matching hotspot map and accessible table, reviewed guidance, and a small
   field-report pilot. Add consent, corrections, withdrawal, and media reuse rules.
4. Add concession context and regional comparisons only after data rights,
   boundaries, identities, and counting methods have been checked.

A satellite detection is not a confirmed fire. A concession overlap does not
establish who caused a fire. Do not publish claims that go beyond the evidence.

### Proposed first-slice checks

- Two independent orbs can start with separate data and no production credentials.
- An anonymous request cannot read an unreviewed report or a private original.
- Only an authorized reviewer can publish, correct, or withdraw a report.
- A failed file operation cannot expose an unpublished file. A database
  transaction does not make filesystem changes atomic. Prepare the public copy
  before publication and include it only in an approved public export.
- Withdrawal removes the public export and cached copies under ADR 0002's rules.
  Copies already downloaded cannot be recalled.
- Concurrent review actions cannot publish the same revision twice.
- Resume does not install dependencies. A supervised service uses the pinned tools.

## Open items before release

Choose the pilot region, reviewers, public URL, and operating budget. Agree the
retention policy and publication rules. Specify reviewer invitations, upload limits,
media processing, backup recovery targets, and the migration procedure. Verify
the fresh application before selecting exact package versions.

Before the first external report, test reviewer sessions, upload restrictions,
publication access, and withdrawal. Before production release, test a database
and media restore. Also test a compatible migration, duplicate ingestion
prevention, and a failed deployment that leaves the old version available.

This decision does not authorize a deployment, purchase, or remote issue cleanup.
The current orb scripts still serve the old scaffold. They need replacement or
revision during implementation. No new application has been built yet.

## References

- [Product handoff: Fizzy card 479](https://app.fizzy.do/6104728/cards/479)
- [Source ideas](https://docs.google.com/document/d/12L8ggNRNkU3siuYyniha8cMtnfdmuqkxTvKoH8x8Q3M/edit)
- [Decision discussion](https://ampcode.com/threads/T-01a1447e-b3df-739d-82e4-48e8f72ea5ad)
- [Vite+ environment management](https://viteplus.dev/guide/env)
- [Vite+ built-in commands and framework scripts](https://viteplus.dev/guide/troubleshooting)
- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [Google callback URL rules](https://developers.google.com/identity/protocols/oauth2/web-server#redirect-uri-validation-rules)
- [Kamal volume mounts](https://kamal-deploy.org/docs/configuration/overview/#volumes)
- [Kamal proxy](https://kamal-deploy.org/docs/configuration/proxy/)
