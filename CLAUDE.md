# CLAUDE.md

Use ASD-STE100 Simplified Technical English for English prose.

## Commands

- `pnpm check`: TypeScript, lint, tests, and both native Void builds.
- `pnpm dev`: native Void public development server.
- `pnpm dev:editorial`: native Void editorial server with local D1/R2.
- `pnpm build`: build both targets and validate complete public prerenders.
- `node scripts/check-public.mjs <url>`: check the Caddy static origin.
- `amp orb services ensure`: supervised public dev, editorial dev, and Caddy.

The workspace build scripts use native `vp build`; dev scripts use `vp dev`.
Use the pinned Node.js, pnpm, and Vite+ versions. Run toolchain commands in a
login shell (`bash -lc`) in orbs.

## Boundaries

- Read `CONTEXT.md`, ADR 0002, ADR 0003, and ADR 0004 first. ADR 0001's stack and
  ADR 0005's separate proposal are superseded. `docs/index.md` is historical.
- Use the full native Void stack, with two targets in this repository. Do not
  restore React Router, Docker/Kamal, or local production SQLite/WAL management.
- Keep `apps/public` static-only: no API routes, auth, middleware, crons, queues,
  redirects, rewrites, or application fallback. Prerender every public page and
  its `_void/pages/*.json`. Keep the completeness guard in the build.
- Public reads must work without editorial requests or database access. Generate
  from an approved-public export, never live editorial D1. Use fixtures in orbs.
- Keep editorial runtime code in `apps/editorial`. D1 is managed SQLite with
  async bindings; R2 is object storage. Local Miniflare needs no credentials.
- Keep private originals, public copies, backups, and exports separate. Caddy
  serves only `apps/public/dist/client`, never the repository or local state.
- Keep the historical `migrations/0001-users.sql` unchanged and unapplied. Future
  product migrations belong to the editorial target and must support overlapping
  application versions.
- Tests use temporary directories. Never use production records or private media
  in tests or snapshots. Normal development needs no Google, NASA, or Cloudflare
  credentials.
- Native Void sign-in allows only Google, disables email/password and account
  linking, and requires invitation/reviewer approval for access. Do not add an
  application test sign-in route. Keep test substitutes under `tests/`.
- Editorial migrations are in `apps/editorial/db/migrations/`. Keep D1 read
  replication off until session revocation is proved with replicas. Never put
  editorial records in cacheable code assets.
- Editorial builds require production `NODE_ENV`. Before deployment, pin
  approved pre-created D1/R2 resources. Never use editorial `--provision`:
  Void 1.1.11 turns on D1 read replication during provisioning.

## Current scope

This is a native foundation and synthetic design review, not a reporting product.
Editorial sign-in, sessions, and reviewer access have local implementations.
Editorial is not deployed; live Google checks are not complete. Reports,
ingestion, publication, withdrawal, and media workflows are not implemented.
Do not claim their production checks passed.

Preserve option B and its Cukup-inspired appearance. Shared design code is in
`app/design`. `/` and `/rancangan/b` must export no reports. Keep synthetic-data
warnings and `noindex`. Do not start a redesign. New visual design work needs a
separate user request and the agreed Claude Code Opus 5.5 route.

## Operations

Read `docs/operations.md`. Use supervised orb services. Do not push, deploy,
authenticate a shared service, or change Cloudflare without approval. The user
approved the public-only main deployment workflow and its first deployment.
That approval does not include editorial deployment or unrelated infrastructure.
Keep the existing `www` Netlify redirect until a replacement exists.

Do not promise 24-hour edge stale-on-error from headers. The fallback is the last
valid export with its timestamp. Measure publication frequency and cache behavior
before release. Block real reports until serialized publication and a
withdrawal-safe rollback procedure exist. Verify withdrawal on every controlled
hostname with `/__void/ready` and missing-content HTTP checks; ISR is not enough.
