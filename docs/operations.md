# Infrastructure operations

This is a development foundation with a synthetic design preview on Cloudflare.
No production application host, Google client, or container registry has been
configured. No deployment is authorized by this guide.

## Local data

`DATA_DIR` selects the storage directory. It defaults to `.data` in the repository.
Production uses `/data`. Orb setup always seeds the repository's `.data`, not an
external path from project settings. Never put production files in this directory
in an orb snapshot.

| Path below `DATA_DIR` | Content                                                    |
| --------------------- | ---------------------------------------------------------- |
| `db/kawal.sqlite`     | Editorial database and adjacent WAL files                  |
| `private/originals/`  | Private source media                                       |
| `public/releases/`    | Prepared public file sets                                  |
| `public/current`      | Relative symlink to the active file set                    |
| `backups/`            | Local recovery files; not a substitute for off-host copies |

SQLite uses WAL, full synchronization, foreign keys, and a five-second busy
timeout. `db:migrate` uses `BEGIN IMMEDIATE` to serialize migration checks and
updates. A failed migration rolls back the batch. Changed applied migrations
fail rather than silently running again. Keep migrations compatible with the old
application during a rolling deployment. An image rollback does not revert SQL.

Local seed data contains a reader and a reviewer under `urn:kawal:local-test`.
These records do not enable a sign-in route. Repeated seeds do not restore a
removed reviewer role or remove an account disablement.

## Static reads

`react-router.config.ts` lists public routes to prerender. Never include editorial
or authentication routes. The public Caddy process has no database dependency and
does not forward missing routes to the application. The current page is only an
unstyled placeholder; the `/rancangan` routes are synthetic design reviews.
Data-bearing public routes must use loaders and export their navigation payloads.

`public:init` copies `build/client` to a new release directory, then creates the
`current` symlink only if it does not exist. The command does not replace an
active export during a deployment. Do not use it to publish new reports or to
withdraw content. The versioned content export, activation order, withdrawal
state, and CDN purge workflow must be built in the report implementation.

The default response policy is the strict report policy from ADR 0002:
`public, max-age=60, s-maxage=60, must-revalidate`. Only hash-named code under
`/assets/` has an immutable one-year cache period. Keep report data and media out
of that directory. Option B's page (`/rancangan/b`, with or without a trailing
slash) and navigation data (`/rancangan/b.data`) use
`public, max-age=300, stale-if-error=86400`. Its loader exports only detections,
feed status, guidance, and the generation time, not field reports. Options A and
C retain the strict report policy. Update the exact route allowlist and HTTP
checks when B moves to a production route; do not extend this policy to all review
pages. Authentication, editorial, preview, and private paths return 404 from the
public origin.

Cloudflare is not part of local development. Before production, configure an
explicit public HTML/JSON/navigation cache allowlist and an editorial/auth bypass.
Do not enable Always Online. Test actual cache hits, expiry, errors, and purges.
Origin cache headers alone do not prove Cloudflare behavior.

Set Browser Cache TTL to **Respect Existing Headers**. Prefer origin cache
directives to an Edge Cache TTL override. That override has plan-specific
minimums and can disable revalidation. Verify the 60-second report limit on the
selected plan. See [Cloudflare cache TTL](https://developers.cloudflare.com/cache/how-to/edge-browser-cache-ttl/).

Do not reuse the report headers on guidance routes that need stale-on-error.
Cloudflare ignores `stale-if-error` with `must-revalidate` or applicable `s-maxage`.
Test the intended error cases before promising outage coverage. See
[Origin Cache Control](https://developers.cloudflare.com/cache/concepts/cache-control/).

A purge API response of HTTP 200 confirms receipt, not content removal. Check
post-purge cache status and the expected revision or removal response at each
affected public URL. Do not treat an old cached response as a successful
withdrawal. See [purge verification](https://developers.cloudflare.com/cache/how-to/purge-cache/).

### Cloudflare design preview

The isolated `kawal-asap-design-review` Worker serves only the synthetic static
preview. Its exact root path returns `302 Location: /rancangan/b`. The destination
is relative, so it stays on the request host. Other review paths stay available.
This is not a production publication or a check of Caddy cache headers.

Use the pinned Void CLI and `void.config.ts` for subsequent deployments. React
Router still builds the files with `vp run build`. Void's explicit static mode
uploads only `build/client`; `public/.assetsignore` excludes Vite build metadata.
It must not upload `build/server`, SQLite, private media, or backups. Do not add
the Void Vite plugin, enable ISR, or use the `--spa` flag.

The CLI adds a small asset-routing Worker for redirects and response headers.
This is not an editorial runtime, but its requests count against Worker limits.
The configured cache classes match ADR 0002. Check the deployed headers and
expiry behavior; configuration alone does not prove global purge or stale delivery.

Run `vp run check` before deployment. Authenticate the CLI with
`pnpm exec void cloudflare login`, or use a scoped `CLOUDFLARE_API_TOKEN` from a
secret store. Never put tokens in config, commands, or Git. Confirm the account,
existing Worker, and `kawal.id` route before the first handoff. Then use
`vp run deploy:preview` when deployment is authorized. Keep review warnings and
`noindex`; do not enable an automatic deployment workflow. Void has no deploy
dry-run flag. Do not use a deploy command as a local validation check.

Keep generated local state under the ignored `.void` directory. If deployment
creates `void.lock.json`, review and commit its resource IDs before deployment
from another machine. Never include credentials. The current live preview uses
the earlier assets-only upload until a Void deployment is verified. See
[ADR 0004](adr/0004-void-static-deployment.md) and
[Void deployment](https://void.cloud/guide/deployment).

The Cloudflare Free zone `kawal.id` uses `jasmine.ns.cloudflare.com` and
`simon.ns.cloudflare.com`. Its apex custom domain points to the preview Worker.
Cloudflare manages the apex DNS record; do not replace it with old Netlify
addresses. HTTPS redirection is enabled. Check certificate validity and public
DNS resolution before declaring a domain cutover complete.

The existing DNS-only `www` records still use Netlify to redirect to
`https://kawal.id/`. Keep that Netlify site until this redirect has a replacement.
Preserve other DNS records before any future nameserver change.

## Backup and restore

Use SQLite's online backup API. Do not copy a live database file:

```sh
pnpm db:backup /safe/path/new-backup.sqlite
```

The command refuses an existing destination. Keep its parent directory private.
The automated test restores a backup and checks its integrity and committed data
while the source database is still open in WAL mode.

This command backs up only SQLite. Before external reports are accepted, add a
consistent media manifest, media retention, off-host copies, retention limits,
and a complete database-plus-media restore drill. Set recovery targets with the
operator. Do not claim that a database-only test proves full site recovery.

## Container checks

The Dockerfile has two final targets:

```sh
docker build --target editorial -t kawal-asap-editorial:local .
docker build --target public -t kawal-asap-public:local .
```

The editorial container runs as UID 1000, applies locked migrations, bootstraps
public files if needed, and starts React Router on port 3000. Mount the whole
data directory, not only the SQLite file. The public container runs Caddy on
port 8080 and mounts only the public subtree, read-only. It does not contain
the application, database driver, or private media.

Create `/srv/kawal-asap` on the target host with ownership for UID 1000 before
the first deployment. Mount that directory at `/data` in the editorial service.
Mount `/srv/kawal-asap/public` at `/data/public:ro` in the public service. The
relative symlink works at both mount points.

CI starts both container targets with temporary local storage, stops the
editorial container, and checks public reads with `scripts/check-public.mjs`.
The checks cover each cache class, report isolation in B, private paths, and
missing routes. They verify origin headers, not Cloudflare stale delivery.
To repeat the HTTP checks against a running static server, run
`node scripts/check-public.mjs <public-server-url>`.

## Kamal templates

Use Kamal 2.12. The separate configurations are
`config/deploy.editorial.yml` and `config/deploy.public.yml`. They describe two
processes on the same host, not two source projects. Separate services let an
editorial restart leave the public server running.

Supply `KAMAL_HOST`, `KAMAL_IMAGE_PREFIX`, `KAMAL_REGISTRY_USERNAME`,
`EDITORIAL_HOST`, and `PUBLIC_HOST`. Store `KAMAL_REGISTRY_PASSWORD` in Kamal's
secret mechanism, not in Git. Register separate public and editorial hostnames.
Validate both configurations with `kamal config -c <file>` before deployment.
Do not run `kamal setup` or `kamal deploy` without approval.

Deploy editorial first on a new host so the public directory exists before the
public service starts. Use valid origin TLS behind Cloudflare. Keep the origin
access rules and certificate renewal path consistent. Set up health checks,
disk monitoring, backup alerts, and a tested recovery procedure before release.

Google sign-in still needs an OIDC implementation, exact callback registration,
stable session secrets, and validation tests. None of those blocks local tests.
