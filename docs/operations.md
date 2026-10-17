# Foundation operations

This is a native Void development foundation and synthetic design review.
App sign-in and reviewer access have local implementations. Live Google
and app deployment checks are not complete. Reports, ingestion,
publication, withdrawal, and media workflows are not implemented.
The user approved automatic public-preview deployment from main.
App deployment and unrelated shared infrastructure changes need approval.

## Tools and local state

Use the pinned Node.js, pnpm, Vite+, and Caddy versions. `pnpm build` runs native
`vp build` for both workspaces. Each workspace explicitly uses the Vite+ core
alias so Void plugins do not load a second Vite installation.
App builds reject a non-production `NODE_ENV`: Vite would otherwise
include development auth and source-module behavior in the Worker.

Two exact optional Vitest peer exceptions cover Cloudflare `workers-auth` 0.14.0
and `workers-utils` 0.47.2. They do not use Vitest through Wrangler's runtime
exports. The utils test-helper entry does import Vitest; this project does not
use it. These exceptions do not claim Cloudflare test-helper compatibility with
Vitest 5. Recheck them when those packages change.

`apps/app/.void` holds local Miniflare D1/R2 state. Generated `.void`,
`.wrangler`, and `dist` trees are ignored. No production records or credentials
belong in these trees or orb snapshots. Separate checkouts use separate state.
Do not copy or remove non-disposable local state without approval.

D1 is managed SQLite through async bindings, not a `better-sqlite3` file with
application-managed WAL and backup locks. R2 replaces local production media
files. The root migration is historical and is not applied. Future product
migrations belong to `apps/app/db/migrations/`. There is no
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

| Service  | Purpose                                                            |
| -------- | ------------------------------------------------------------------ |
| `dev`    | Public native Void development with live reload                    |
| `app`    | Separate local Workers runtime; `/healthz` queries D1 and lists R2 |
| `public` | Build public output and serve it with Caddy; no app runtime        |

Use `amp orb service status <name>`, `logs <name>`, `stop <name>`, and
`restart <name>`. The public service has no app proxy. Stop both `dev` and
`app`, confirm the app port is closed, then run
`node scripts/check-public.mjs <static-origin-url>`. Restart the services when
you need development again. The health check proves local binding access only,
not durable reports, R2 uploads, backup recovery, or production readiness.

CI installs the same toolchain and runs `pnpm check`. It then starts local
app development, checks D1/R2 health, stops its process group, and checks static Caddy
reads. These checks need no credentials. A separate step in the same job deploys
only the public preview on a main push, after all checks pass.

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
metadata is not public: `apps/public/public/.assetsignore` excludes `/.vite/`
from the Cloudflare upload. Review pages retain `noindex` and synthetic-data warnings.
Options A/C contain synthetic reports; `/` and B do not.

Pages and data use `public, max-age=60, must-revalidate`. Only hash-named code
assets use an immutable one-year policy. These are local origin headers, not
proof of Cloudflare cache behavior. Native client navigation uses static JSON.
Verify both direct requests and native `Link` clicks with the app stopped.

## Public preview deployment

The configured public target is `kawal-asap-design-review` in account
`1d60533bd63392b6dc25160f907c4f76`, with the `kawal.id` custom domain. The app
target is not deployed. Use separate hosts for the public site and the app.

The first native deployment passed on 16 October 2026:
[workflow run](https://github.com/kawaltech/kawal.id/actions/runs/38948227220/attempts/2).
It replaced the old React Router preview and renders B directly at `/`.
Local builds do not deploy. The approved GitHub Actions workflow deploys the
synthetic public preview after a main push passes checks. It does not deploy
the app, change `www`, or implement report publication.

Set `CLOUDFLARE_API_TOKEN` in the repository's **Settings → Secrets and variables
→ Actions**. Use a scoped token for account `1d60533bd63392b6dc25160f907c4f76`
and zone `kawal.id`. Void documents Account Workers Scripts Edit plus access to
resources it provisions. This target has no D1/R2 bindings. The first deployment
passed with Account Workers Scripts Edit and Account Settings Read, Zone Workers
Routes Edit for `kawal.id`, and User Details Read and Memberships Read. It did not
need KV, R2, Pages, Tail, Builds, Agents, Observability, or Containers access.
This tested permission set is not a claim of the exact minimum. Restrict the
token to this account and zone. Never enter the token in chat. The workflow
fails explicitly if the secret is absent.

Main runs share one concurrency group and are not cancelled in progress. Before
deployment, each run checks the complete pushed range with
`scripts/check-public-changes.mjs`. It skips deployment and post-deploy checks
only when every changed path is under `docs/`, or is a Markdown file outside
`apps/` and `app/`. All local checks still run. Mixed pushes, code renames into
docs, and missing history require deployment.

The latest-main guard rejects a checked revision when newer code exists. If
only documentation follows it, the checked code can still deploy. This prevents
a docs-only push from cancelling a pending code deployment while also skipping
its own deployment. The workflow uses `--skip-build` to upload the output
that passed the completeness guard, not a second unchecked build. Only the
deployment step receives the token. Normal orb checks need no token.

The CLI stages and probes the candidate before activation. CI reads this run's
`cloudflare_deploy_end` success record, then checks its exact `versionId` through
`/__void/ready` on both `kawal.id` and
`kawal-asap-design-review.zain.workers.dev`. It also checks all HTML/JSON pairs,
code assets, report isolation, and missing private paths. See the Actions run
for the deployed version and check results; a build alone is not deployment proof.

If the CLI or post-deploy checks fail, inspect the active version and both hosts
before retrying. A post-deploy failure does not automatically undo activation.
Trigger synchronization after activation is not fully transactional. Do not
claim the old version is active only because the job failed. Rollback can restore
withdrawn content and is not an approved report recovery procedure.

Before an authorized native deployment, confirm the account, Worker, routes,
asset-only public classification, expected readiness version, and complete
prerenders. Authenticate through the supported CLI flow or a secret store. Do
not extract MCP credentials or put tokens in commands, config, logs, or Git.
`pnpm deploy:preview` builds and deploys; it is not a dry run. Do not run it for
local validation. Review any generated resource lock before use on another
machine. Manual deployments must not overlap CI. They need separate approval.

The app can deploy to a separate staging host after native Google-only sign-in
and reviewer controls pass tests and the owner approves the named remote writes.
Staging need not wait for real reports, but real reports remain blocked by the
withdrawal and recovery gates below.

The zone uses `jasmine.ns.cloudflare.com` and `simon.ns.cloudflare.com`.
The apex is bound to the preview Worker, with HTTPS redirection enabled. The
DNS-only `www` records still use Netlify to redirect to `https://kawal.id/`.
Keep that site until a replacement redirect exists. Do not claim worldwide DNS
propagation from resolver-override checks.

## App sign-in and access

The staging host is `app.kawal.id`. Its deployment is separate from the public
workflow. See [app staging preparation](app-staging.md) for the
approval gates, exact Google callback, secrets, and first-deployment limits.
Do not run the deployment or remote database commands as local checks.

Google sign-in alone gives no reviewer rights. A verified Google email can
claim an invitation once. The grant then requires both the native user ID and
the Google subject. The guard reads D1 primary on each protected request.
Protected page visits redirect to `/sign-in` or `/access-pending`; data and API
requests get 401 or 403. Sessions expire 12 hours after sign-in, with no sliding
refresh or cookie cache. Each sign-in refreshes the Google email. An invitation
claim uses the last sign-in's verified email, which can be up to 12 hours old.
Sign-out deletes the native session. Administrative revocation also deletes
the user's sessions in the same D1 batch as the grant change.

Keep D1 read replication off for the app. Native session reads use Void's
unconstrained D1 session, although the account and grant reads use primary D1.
Do not enable replicas without tests that prove immediate logout and revocation.
Void 1.1.11 enables replication when it provisions resources. Before an approved
deployment, create D1 with replication off and create R2, then pin both resources
in a reviewed config. The staging preflight deliberately fails until those pins
exist. Never use `--provision` for the app.
HTML, data, and auth responses use no-store. Native hash-named code assets can
use Void's cache policy; do not put app records in those assets.

`apps/app/scripts/reviewer-admin.ts` changes local D1 only. It refuses
`--remote`. Use `--print-sql` to review SQL without applying it. Do not put a
real email address or printed invitation SQL in Git. Remote application of
that SQL needs approval. A bootstrap invitation is possible only when no active
admin exists. It expires after 72 hours. No admin HTTP routes or UI exist in
this slice.

Normal orbs need no Google client. Without Google settings, sign-in fails
closed and local health remains available. Tests build a fresh Worker, apply
the native migrations to temporary D1, and use a test-only Google token
substitute with all other outbound requests denied. This checks the code flow,
not live Google service behavior. There is no application test sign-in route.

If an older local dev state has auth tables but no Void migration history, dev
can refuse startup. Do not delete that state automatically. First confirm that
it is disposable and contains no work to keep. Only then, from `apps/app`,
run `pnpm exec void db reset` to rebuild local D1 from the committed migrations.
Never use this recovery step with remote or non-disposable data. A fresh local
state applies both migrations without a reset.

## Release gates

- Keep public generation on an approved-public export, not live app D1.
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
