# Foundation operations

This is a native Void development foundation and synthetic design review.
No sign-in, reports, ingestion, publication, withdrawal, or media workflow is
implemented. No native Void deployment has been made. This guide does not
authorize deployment, authentication, or shared infrastructure changes.

## Tools and local state

Use the pinned Node.js, pnpm, Vite+, and Caddy versions. `pnpm build` runs native
`vp build` for both workspaces. Each workspace explicitly uses the Vite+ core
alias so Void plugins do not load a second Vite installation.

Two exact optional Vitest peer exceptions cover Cloudflare `workers-auth` 0.14.0
and `workers-utils` 0.47.2. They do not use Vitest through Wrangler's runtime
exports. The utils test-helper entry does import Vitest; this project does not
use it. These exceptions do not claim Cloudflare test-helper compatibility with
Vitest 5. Recheck them when those packages change.

`apps/editorial/.void` holds local Miniflare D1/R2 state. Generated `.void`,
`.wrangler`, and `dist` trees are ignored. No production records or credentials
belong in these trees or orb snapshots. Separate checkouts use separate state.
Do not copy or remove non-disposable local state without approval.

D1 is managed SQLite through async bindings, not a `better-sqlite3` file with
application-managed WAL and backup locks. R2 replaces local production media
files. The root migration is historical and is not applied. Future product
migrations belong to `apps/editorial/migrations/`; none exist yet. There is no
`db:seed`, `db:backup`, `public:init`, Docker target, or Kamal deployment now.

## Orb lifecycle and services

`.agents/setup` installs tools, installs locked workspace dependencies, and
builds both targets without credentials. It must be safe to repeat. The login
profile hook must come after Amp's environment block, which can reset `PATH`.
`.agents/resume` only checks tools and must finish within ten seconds.

```sh
.agents/setup
pnpm check
amp orb services ensure
```

Use the returned portal URLs, not sandbox-local addresses.

| Service     | Purpose                                                            |
| ----------- | ------------------------------------------------------------------ |
| `dev`       | Public native Void development with live reload                    |
| `editorial` | Separate local Workers runtime; `/healthz` queries D1 and lists R2 |
| `public`    | Build public output and serve it with Caddy; no app runtime        |

Use `amp orb service status <name>`, `logs <name>`, `stop <name>`, and
`restart <name>`. The public service has no editorial proxy. Stop both `dev` and
`editorial`, confirm the editorial port is closed, then run
`node scripts/check-public.mjs <static-origin-url>`. Restart the services when
you need development again. The health check proves local binding access only,
not durable reports, R2 uploads, backup recovery, or production readiness.

CI installs the same toolchain and runs `pnpm check`. It then starts local
editorial, checks D1/R2 health, stops its process group, and checks static Caddy
reads. It does not deploy or need service credentials.

## Static reads and build guard

`apps/public` uses `output: "static"`, no ISR, and no backend conventions. Every
page must have HTML and native `_void/pages/*.json`. The build guard rejects
missing files, loader errors, backend convention directories, and report data in
`/` or `/rancangan/b`. Keep it in the build: Void 1.1.11 can warn after a failed
prerender and still exit successfully. Do not add auth, redirects, rewrites, or
fallbacks that turn direct reads or navigation into application requests.

Caddy serves only `apps/public/dist/client`. It does not serve source, local
D1/R2, private files, or backups. It blocks private paths and returns 404 for
missing routes, JSON, and old React Router `.data` paths. Generated build
metadata is not public. Review pages retain `noindex` and synthetic-data warnings.
Options A/C contain synthetic reports; `/` and B do not.

Pages and data use `public, max-age=60, must-revalidate`. Only hash-named code
assets use an immutable one-year policy. These are local origin headers, not
proof of Cloudflare cache behavior. Native client navigation uses static JSON.
Verify both direct requests and native `Link` clicks with editorial stopped.

## Deployment boundary

The configured public target is `kawal-asap-design-review` in account
`1d60533bd63392b6dc25160f907c4f76`, with the `kawal.id` custom domain. The editorial
target is not deployed. Use separate hosts for public and future editorial work.

The live preview still uses the earlier assets-only React Router export from
[the approved build](https://github.com/kawaltech/kawal.id/commit/810db964be60017101c5c984ad0c4b854654e499).
Its root redirects to `/rancangan/b`. The native source instead renders B at `/`.
Neither local builds nor a push change the live deployment.

Before an authorized native deployment, confirm the account, Worker, routes,
asset-only public classification, expected readiness version, and complete
prerenders. Authenticate through the supported CLI flow or a secret store. Do
not extract MCP credentials or put tokens in commands, config, logs, or Git.
`pnpm deploy:preview` builds and deploys; it is not a dry run. Do not run it for
local validation. Review any generated resource lock before use on another
machine. Do not enable automatic deployment.

The zone uses `jasmine.ns.cloudflare.com` and `simon.ns.cloudflare.com`.
The apex is bound to the preview Worker, with HTTPS redirection enabled. The
DNS-only `www` records still use Netlify to redirect to `https://kawal.id/`.
Keep that site until a replacement redirect exists. Do not claim worldwide DNS
propagation from resolver-override checks.

## Release gates

- Keep public generation on an approved-public export, not live editorial D1.
  Direct-deploy SSG reads local Miniflare state. Normal orbs use fixtures.
- Serialize publication. A late older export must not replace a newer one.
  Each update is a deployment; measure timing and publication frequency.
- Keep the last valid export and show its timestamp on normal generation failure.
  Do not promise 24-hour edge stale-on-error. Void runs a routing Worker before
  assets, consumes quota, and does not use Cache API by default. Zone Cache Rules
  and `s-maxage`/`stale-if-error` alone do not prove caching in this path. Measure
  real hits, expiry, failure behavior, quotas, and costs before release.
- Block real report publication until rollback cannot restore withdrawn reports.
  Include CLI rollback, dashboard rollback, and automatic readiness-failure
  restoration. Check the active `/__void/ready` version and missing-content HTTP
  responses on every controlled hostname. Check old data/media paths as well as
  pages. ISR and a successful purge API call are not proof of withdrawal.
- Build native Void Google-only sign-in with email/password and account linking
  disabled. Require invitation/reviewer approval. Test callback validation,
  sessions, revocation, and permissions. Keep test sign-in out of production.
  Live Google checks are separate; local foundation checks need no Google client.
- Define private-original/public-copy storage boundaries, consent, retention,
  upload limits, and media processing. Review D1 batch/transaction semantics,
  backup retention and Time Travel, then test a full database-plus-media restore.
- Obtain health review of guidance. Remove `/rancangan` review routes and replace
  synthetic fixtures with approved public data before product release. Preserve
  option B's map/table accessibility and unavailable-data behavior.

These are future product and release checks, not completed foundation features.
