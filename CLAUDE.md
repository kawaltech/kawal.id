# CLAUDE.md

Use ASD-STE100 Simplified Technical English for English prose.

## Commands

- `vp run check`: type generation, TypeScript, lint, tests, and framework build.
- `vp run dev`: React Router development server.
- `vp run build`: React Router server build and public prerendering.
- `vp run db:migrate`: locked SQL migrations.
- `vp run db:seed`: local test identities; forbidden in production.
- `amp orb services ensure`: supervised dev and static public services.

Use `vp run dev` and `vp run build`, not the bare Vite+ framework commands.
The project uses Node.js from `.node-version` and pnpm from `package.json`.

## Boundaries

- Read `CONTEXT.md` and both accepted ADRs in `docs/adr/` first.
- The old generic reporting plans in `docs/index.md` are historical.
- Use one React Router Framework Mode codebase with SQLite and local files.
- Public routes must work as prerendered files without Node.js or SQLite.
- Caddy serves only `.data/public/current`. Never expose the whole data directory.
- Keep server-only storage code in `app/lib/*.server.ts`.
- `migrations/*.sql` are immutable after application. Add a new migration.
- Keep migrations compatible with overlapping old and new containers.
- Store private originals, the database, backups, and public copies separately.
- Ordinary development must not require external service credentials.
- Do not add hosted database or authentication services, Redis, or a queue.
- Do not publish test identities, unreviewed reports, or private media.
- Tests use temporary directories. Never use production data in tests or snapshots.

## Current scope

The repository contains infrastructure and an unstyled placeholder, not the
product. Sign-in, sessions, reports, ingestion, publication, and CDN purges are
not implemented. Do not claim that their production checks have passed.

Visual design belongs to a separate Claude Code Opus 5.5 thread after the
infrastructure is ready. Do not treat the placeholder as a design reference.

## Operations

Read `docs/operations.md` for storage, backups, container targets, and Kamal.
Use supervised orb services. Do not deploy, push images, or change Cloudflare
without approval. `public:init` is a bootstrap command, not a publication or
withdrawal command. It must never replace an active export on app startup.
