# Infrastructure operations

This is a development foundation. No production host, Google client, Cloudflare
zone, or registry has been configured. No deployment is authorized by this guide.

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
unstyled placeholder. Data-bearing public routes must use loaders and export
their navigation payloads when those routes are added.

`public:init` copies `build/client` to a new release directory, then creates the
`current` symlink only if it does not exist. The command does not replace an
active export during a deployment. Do not use it to publish new reports or to
withdraw content. The versioned content export, activation order, withdrawal
state, and CDN purge workflow must be built in the report implementation.

The default response policy is the strict report policy from ADR 0002:
`public, max-age=60, s-maxage=60, must-revalidate`. Only hash-named code under
`/assets/` has an immutable one-year cache period. Keep report data and media out
of that directory. Add five-minute freshness and stale-on-error only to a route
that contains guidance or detections and no reports. Authentication, editorial,
preview, and private paths return 404 from the public origin.

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
The checks cover page and code cache headers, private paths, and missing routes.
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
