# App staging preparation

This document prepares a manual staging deployment of `apps/app` to
`https://app.kawal.id`. It is preparation only. Nobody has approved the
deployment, the Google OAuth client, the new D1/R2 resources, the secrets, or
the DNS change. Do not run the remote commands in this document before you get
approval for each gate.

The public site `kawal.id` stays static and independent. This procedure does not
change the public Worker, its workflow, or the `www` redirect.

The facts below come from the installed source of Void 1.1.11,
`@void/deploy-cloudflare` 1.1.11, and `better-auth` 1.7.10. Paths are relative
to the installed package. Line numbers are for these versions only. Check them
again after an upgrade.

## Gates

Do the steps in this order. Stop at the first failure.

| Gate | Condition                                                                                                                                  | Type                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| 1    | Integrated auth, reviewer access, and tests are on one reviewed commit.                                                                    | Code                |
| 2    | `pnpm check` and the app tests pass on that commit.                                                                                        | Local               |
| 3    | Approval: create D1 `kawal-app-db` with read replication off, and R2 bucket `kawal-app-storage`.                                 | Cloudflare write    |
| 4    | Read the new D1 settings and confirm that read replication is off. Record both resource IDs.                                               | Read-only           |
| 5    | Pin the D1 ID and the R2 bucket in `void.config.ts` in a reviewed commit. Repeat gate 2.                                                   | Code                |
| 6    | `node scripts/app-staging.mjs preflight <commit>` passes on that final commit.                                                             | Local, no network   |
| 7    | Approval: register the Google OAuth client for the staging callback.                                                                       | External (Google)   |
| 8    | Approval: create the Worker secrets.                                                                                                       | Cloudflare write    |
| 9    | Approval: apply migrations, attach `app.kawal.id`, and deploy. Accept that the first version is live before readiness and has no rollback. | Cloudflare and DNS  |
| 10   | `node scripts/check-app-staging.mjs` passes with the new version ID.                                                                       | Read-only HTTP      |
| 11   | Approval: write the first reviewer invitation to remote D1.                                                                                | Cloudflare D1 write |

The preflight fails on purpose until gates 3-5 are complete. It requires the
pinned D1 database, the pinned R2 bucket, and the exact `migrations_dir`. This
blocker prevents a deployment that provisions resources. Provisioning turns on
D1 read replication (see [D1 and R2 before deployment](#d1-and-r2-before-deployment)).

An approval covers only the actions it names. One approval can cover several
named gates. Record the approval with the commit SHA. Do not run a manual
deployment at the same time as another deployment.

## Hosts

| Host                              | Expected state                                                 |
| --------------------------------- | -------------------------------------------------------------- |
| `https://app.kawal.id`            | App staging Worker `kawal-app`, through Custom Domain.    |
| `https://kawal.id`                | Public static Worker. It must not serve app routes.            |
| `kawal-app.zain.workers.dev` | Disabled (`workers_dev: false`). It must not serve the Worker. |
| Version preview URLs              | Disabled (`preview_urls: false`).                              |
| `editor.kawal.id`                 | Not used.                                                      |

On 16 October 2026, a public resolver (`1.1.1.1`) returned `NXDOMAIN` for
`app.kawal.id`. This is not proof that no record or wildcard exists in the zone.
Before gate 9, read the `kawal.id` zone records in Cloudflare and confirm that
no record for `app.kawal.id` or `*.kawal.id` conflicts. Also confirm that D1 read
replication is off. Native session reads are not pinned to primary D1; do not
enable replication without tests that prove immediate logout and revocation.

## Required configuration

`apps/app/void.config.ts` pins account
`1d60533bd63392b6dc25160f907c4f76` and Worker `kawal-app`.
Its only route is `{ pattern: "app.kawal.id", custom_domain: true }`.
Keep `workers_dev` and `preview_urls` false. Application responses use
`Cache-Control: private, no-store` and `X-Robots-Tag: noindex`. The local
configuration is not approval to apply it remotely.

- The route is necessary. Without a route, the first deployment has no URL to
  check (see [Readiness](#readiness-with-workersdev-and-previews-disabled)).
- The account pin prevents a deployment to a different account.
- `X-Robots-Tag: noindex` is defense in depth beside the page meta. It is not
  access control. The header middleware sets it on application responses
  (`dist/runtime/routing.mjs:886`). It does not apply to `/__void/ready`
  (`dist/runtime/routing.mjs:675`).
- Local development is not affected. Routes and the account are used only for
  deployment.

After gate 4, the config owner adds the real resources. Use the ID from gate 4:

```ts
  cloudflare: {
    // ...
    d1_databases: [
      {
        binding: "DB",
        database_name: "kawal-app-db",
        database_id: "<D1 UUID from gate 4>",
        migrations_dir: "./db/migrations",
      },
    ],
    r2_buckets: [{ binding: "STORAGE", bucket_name: "kawal-app-storage" }],
  },
```

The D1 ID and the bucket name are resource identifiers, not secrets. The
`migrations_dir` value must be exactly `./db/migrations`.

## What `void deploy --platform cloudflare` does

Run the deployment from `apps/app`. In `dist/deploy-DsW-PrRQ.mjs`, the
command does these steps in this order. Each step marked "write" changes shared
state.

1. Reads the config and the project paths. Migrations come from
   `apps/app/db/migrations/` (`dist/project-paths-DGu_QZ_Q.mjs:102`).
   Void collects every `*.sql` file except `seed.sql`, in filename order
   (`dist/collect-Dew86qce.mjs:8`). The root `migrations/0001-users.sql` is not
   used.
2. Provisioning. With the pins from gate 5, Void skips provisioning and creates
   no resource. See the next section for the exact conditions. If a pin is
   missing, Void creates or adopts the resources with no prompt (`:4792`),
   and it turns on D1 read replication. The preflight blocks that case.
3. Builds the Worker again with `vite build` (`:4069`), which is the Vite+ core
   alias in this workspace. `--skip-build` is not available for a Worker app
   (`:4547`). The native build adds the `__VOID_VERSION_METADATA` binding
   (`dist/version-metadata-B1Bm2wSq.mjs:54`, `:70`). Thus `/__void/ready`
   returns `versionId`.
4. Collects the migrations (`:4101`). The deployment stops if the D1 binding has
   no `migrations_dir` (`:4166`). It also stops if the migrations do not make
   the Better Auth schema.
5. Write: ensures `BETTER_AUTH_SECRET` (`:1721`). If the Worker does not exist,
   Void makes a random 32-byte value (`:1746`) and uploads it with the first
   version. If the Worker exists without this secret, Void writes the secret
   before the upload.
6. Write: applies pending D1 migrations to remote D1, then makes sure that no
   migration is pending (`:4296`). This occurs before the new code gets
   traffic. Rollback does not undo migrations. Each migration must therefore
   work with the old and the new application version.
7. Write: uploads and activates the Worker, attaches the triggers and the
   Custom Domain, and checks readiness. See the next section.
8. Writes `cloudflare_deploy_end` with `worker` and `versionId` to the JSONL log
   in `~/.void/logs/` (`:3318`).
9. Local write: Void writes `apps/app/void.lock.json`
   (`dist/cloudflare-config-rdFOys4X.mjs:11`, `:88`, `:140`). This file records
   the authored `cloudflare` block, the resolved config with the D1 ID, the R2
   bucket name, and `migrations_dir`. The coordinator must review and commit it
   before another machine deploys. The lock contains resource IDs, not secrets.

## D1 and R2 before deployment

Void 1.1.11 turns on D1 read replication each time it provisions. It has no
setting to stop this. Native session reads are not pinned to the primary
database, so replication must stay off. Thus an approved operator creates D1
and R2 before the deployment, and the deployment must not provision.

A future product that stores data in `kawal-app-db` shares its backups,
restores, and access boundary. Its tables must have a clear product prefix or
an identified owner.

Source facts (read-only, `void/dist` 1.1.11):

- `reconcileD1` (`provision-BuifYvLc.mjs:1337`) always calls the replication
  step for a reused, adopted, or created database (`:1460`-`:1472`). That step
  sends `read_replication: { mode: "auto" }` (`:1324`-`:1335`). The Void guide
  says the same (`docs/guide/database/d1.md:43`).
- Deploy provisions only if one condition is true
  (`deploy-DsW-PrRQ.mjs:4790`-`:4792`):
  - `--provision` is given. Never use it for this target.
  - The drift check finds a missing resource (`provision-BuifYvLc.mjs:20`).
    D1 is present only if the `DB` entry has a real `database_id`: a UUID that
    is not `local` (`:62`, `:67`). R2 is present only if the `STORAGE` entry has
    a `bucket_name` that is not the `default` placeholder (`:86`). A KV,
    Hyperdrive, or queue binding without a real resource also starts
    provisioning (`:20`; queues at `deploy-DsW-PrRQ.mjs:4815`-`:4824`).
  - It is a first deployment and the stored `migrations_dir` is not exactly
    `./db/migrations` (`deploy-DsW-PrRQ.mjs:4743`, `:4791`, `:749`).
- The drift check reads the materialized config. Void makes it from the
  authored `cloudflare` block and the lock file
  (`cloudflare-config-rdFOys4X.mjs:119`-`:128`). Thus pins in
  `void.config.ts` are enough.
- With a real ID, Void keeps the stored D1 name (`deploy-DsW-PrRQ.mjs:763`) and
  the stored bucket name (`:782`).
- The deploy log records `cloudflare_deploy_start` with `provision: true` for
  `--provision` (`:4987`), and `cloudflare_provisioned` when provisioning ran
  (`:4760`). `node scripts/app-staging.mjs version` fails if it finds
  either record for the deployment.

Procedure for gates 3 to 5:

1. After approval, create D1 `kawal-app-db` in account
   `1d60533bd63392b6dc25160f907c4f76` in the Cloudflare dashboard. Record the
   approved location choice. Do not turn on read replication.
2. Create R2 bucket `kawal-app-storage` in the same account. Keep
   public access and custom domains for the bucket off.
3. Read the D1 settings. Confirm that read replication is off. Record the
   database UUID.
4. Give the UUID to the config owner for the pin in `void.config.ts`.

The repository has no direct Wrangler command. A CLI path for gates 3 and 4
needs a shared package change by the coordinator.

## Readiness with workers.dev and previews disabled

The source in `@void/deploy-cloudflare/dist/index.mjs` gives this behavior for
this configuration:

- First deployment: Cloudflare requires a non-versioned bootstrap. The Worker
  becomes active before the readiness check. The check URL is the first Custom
  Domain route (`:1057`, `:1874`), thus `https://app.kawal.id/__void/ready`.
  Void waits up to 300 seconds for DNS and TLS (`:1978`). It requires the
  uploaded `versionId`. If the check fails, there is no previous version to
  restore (`:1986`). The failed version stays active on `app.kawal.id`.
- Without the route, `customRouteReadinessUrl([])` gives no URL. Then the
  bootstrap fails with `bootstrap-output-invalid` after the Worker is already
  published. Thus the route must be in the config before gate 6.
- Later deployments: Void uploads a version and stages it at 0% beside the
  current version (`:2115`). Then it checks `https://app.kawal.id/__void/ready`
  with the `Cloudflare-Workers-Version-Overrides` header (`:1487`, `:2175`). A
  failure keeps the old version active.

Because the first version is active before its check, the integrated code must
be safe at publication. Anonymous requests must not get app data.

## Google OAuth client

Do this at gate 7. Use a Google Cloud project that the owner approves.

- Application type: Web application.
- Authorized JavaScript origin: `https://app.kawal.id`
- Authorized redirect URI: `https://app.kawal.id/api/auth/callback/google`

Source: Void sets `basePath: "/api/auth"`
(`dist/better-auth-shared-D-6z0q0f.mjs:236`). Better Auth makes the redirect
URI from `${baseURL}${basePath}/callback/${provider.id}`
(`better-auth/dist/oauth2/utils.mjs:29`, `dist/api/routes/sign-in.mjs:229`).
The default `baseURL` is the request origin (`:235`). The auth owner pins
`baseURL` and `trustedOrigins` to `AUTH_BASE_URL` in `apps/app/auth.ts`.
Without `AUTH_BASE_URL`, a production build keeps Google disabled.

Do not register `localhost`, `workers.dev`, or `kawal.id` callbacks for this
client. Local checks use a test substitute and need no Google client.

## Secrets

| Name                        | Value                      | Source                    |
| --------------------------- | -------------------------- | ------------------------- |
| `AUTH_GOOGLE_CLIENT_ID`     | Google OAuth client ID     | Google Cloud console      |
| `AUTH_GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Google Cloud console      |
| `AUTH_BASE_URL`             | `https://app.kawal.id`     | Fixed origin              |
| `BETTER_AUTH_SECRET`        | Random, 32 bytes           | Void creates it at deploy |

Void reads `AUTH_<PROVIDER>_CLIENT_ID` and `AUTH_<PROVIDER>_CLIENT_SECRET`
(`dist/providers-BUHwJlmM.mjs:60`). A missing `BETTER_AUTH_SECRET` stops each
request (`dist/better-auth-shared-D-6z0q0f.mjs:10`).

Secure entry:

- Do not put a value in chat, Git, a command argument, an environment file in the
  repository, or a CI log.
- Enter each value at the masked prompt of `void secret put <NAME>` in a
  terminal. Do not use `void secret put NAME=value`.
- Use your own workstation. Do not paste values into an orb.
- Do not extract connected or MCP credentials for this procedure.

`void secret` and `void db execute --remote` need `platform: "cloudflare"` in
`apps/app/.void/project.json` (`dist/secret-CClHaFxm.mjs:56`). This file
is local and Git ignores it. `void connect --platform cloudflare` writes it and
signs in through the browser.

Set the three Google and base URL secrets before the first deployment. On a
missing Worker, a secret write makes a placeholder draft Worker that returns an
empty response. Void recognizes this draft (`VOID_SECRET_DRAFT_SOURCE` and
`isVoidSecretOnlyDraft` in `@void/deploy-cloudflare/dist/index.mjs`) and
replaces it with the first bootstrap (`:1309`, `:1423`). This path is from
source only; no live test has examined it. The draft can briefly answer on
`workers.dev` until the first deployment applies `workers_dev: false`. The first version is
then checked with all secrets present. If you set secrets after a deployment,
each write makes a new active version without a Void readiness check. Then get
the active version with `void project status` and run gate 10 again.

## Cloudflare authentication

Use the browser flow (`void connect --platform cloudflare`) on the operator's
workstation, or a scoped API token in a secret store. If you use a token,
restrict it to account `1d60533bd63392b6dc25160f907c4f76` and zone `kawal.id`.
The public deployment passed with Account Workers Scripts Edit, Account Settings
Read, Zone Workers Routes Edit, User Details Read, and Memberships Read. That set
attached the `kawal.id` Custom Domain. The app deployment also needs D1 Edit
for migrations and access to the bound R2 bucket. Gate 3 needs D1 Edit and
Workers R2 Storage Edit. This list is not a
proven minimum. Use a token that is separate from the public CI token.

## Procedure

Run from a clean checkout of the approved commit, on one workstation.

```sh
# Gates 1-2: local, no credentials.
git checkout --detach <commit>
pnpm install --frozen-lockfile
pnpm check

# Gates 3-5: see "D1 and R2 before deployment". Then, on the final commit:
git checkout --detach <approved-commit>
pnpm install --frozen-lockfile
pnpm check
# Gate 6: local, no network.
node scripts/app-staging.mjs preflight <approved-commit>
```

The preflight makes no network request. It stops if one of these is false:

- `HEAD` is the approved commit and the working tree is clean.
- The config has the Worker name, the account, the `app.kawal.id` Custom Domain,
  `workers_dev: false`, `preview_urls: false`, no ISR, staged activation, the
  `private, no-store` and `noindex` headers, and the `noindex` meta.
- The config pins exactly one D1 database (`DB`, `kawal-app-db`, a
  real UUID, `migrations_dir: "./db/migrations"`) and exactly one R2 bucket
  (`STORAGE`, `kawal-app-storage`).
- `auth.providers`, if present, is `["google"]`, and `auth.ts` exists.
- `db/migrations` has SQL files, one journal entry for each file, and tables for
  `user`, `session`, `account`, `verification`, `reviewer_invitations`,
  `reviewer_grants`, and `reviewer_audit_events`.
- The build has `workers_dev: false`, `preview_urls: false`, no test sign-in,
  and no KV, queue, or Hyperdrive binding.
- An existing `void.lock.json` has the expected account, the pinned D1 ID, R2,
  and `migrations_dir`.

A passed preflight is not deployment approval.

```sh
# Gate 8, after approval. Interactive, masked prompts.
cd apps/app
pnpm exec void connect --platform cloudflare
pnpm exec void secret put AUTH_GOOGLE_CLIENT_ID
pnpm exec void secret put AUTH_GOOGLE_CLIENT_SECRET
pnpm exec void secret put AUTH_BASE_URL
pnpm exec void secret list

# Gate 9, after approval. Never add --provision.
started="$(node -p Date.now())"
pnpm exec void deploy --platform cloudflare
cd ../..
version="$(node scripts/app-staging.mjs version "$started")"

# Gate 10: read-only.
node scripts/check-app-staging.mjs https://app.kawal.id "$version" \
  https://kawal-app.zain.workers.dev
node scripts/check-public.mjs https://kawal.id <active-public-version-id>
```

After gate 9, read the D1 settings again and confirm that read replication is
still off. Give `apps/app/void.lock.json` to the coordinator for review
and commit. Do not commit it from the deployment workstation without review.

## Post-deployment checks

`scripts/check-app-staging.mjs` sends only anonymous `GET` requests, with
no cookies and no credentials. It does not follow redirects.

| Request                                   | Expected result                                           |
| ----------------------------------------- | --------------------------------------------------------- |
| `/__void/ready`                           | 200, `no-store`, `{ ready: true, versionId: <version> }`  |
| `/` as a page navigation                  | 303 to `/sign-in` on the same origin, no session cookie   |
| `/_void/pages/index.json`                 | 401, not an HTML redirect                                 |
| `/sign-in`                                | 200, `noindex` meta                                       |
| `/api/auth/get-session`                   | 200, body `null`                                          |
| `/api/auth/callback/google` without state | 302 or 303 on the same origin, no session cookie          |
| `/healthz`                                | 200, body exactly `{ "status": "ok" }`, no session cookie |
| `/__kawal-missing-route`                  | 401 or 404, no application fallback                       |
| Each absent host, `/__void/ready`         | An HTTP response that is not a native ready response      |

For an absent host, a network failure does not prove that the host is disabled.
The check fails in that case. Any successful native ready response fails, also
for an older app version. A passed check is HTTP evidence only. Also read
the Worker settings in Cloudflare to confirm that `workers_dev` and preview
URLs are off.

Each app HTML, data, and auth response must have the `no-store` directive.
It must not have `public`, `immutable`, `stale-*`, or a positive `max-age` or `s-maxage`.
Application responses must also have `private`. Better Auth responses can use
its own `no-store` policy. Each application response must have
`X-Robots-Tag: noindex`, and each HTML page must have the `noindex` meta.
Native hash-named code assets are an exception: Void's asset fallback runs
outside this header middleware and uses the asset cache policy. Those assets
must contain no app records or private data.

The script does not prove sign-in, reviewer approval, 403 responses, or
revocation. After gate 11, do these checks manually with a real Google account:

1. Sign in with an account that has no invitation. Pages go to
   `/access-pending` with 303. Data requests get 403.
2. Sign in with the invited account. Protected pages load.
3. Sign out. `/` goes to `/sign-in` again.

## Reviewer bootstrap

Do this at gate 11, after approval. The reviewer owner provides
`apps/app/scripts/reviewer-admin.ts` (run it with Node.js 24). Its
migration is `apps/app/db/migrations/<timestamp>_reviewer_access.sql`, after
the auth migration. It uses only the `DB` binding and no secrets. The bootstrap uses an email
invitation, not a secret.

```sh
cd apps/app
private="$(mktemp -d)"
node scripts/reviewer-admin.ts bootstrap --email <person> --print-sql > "$private/bootstrap.sql"
pnpm exec void db execute --remote --file "$private/bootstrap.sql"
rm -r "$private"
```

- Keep the email out of Git and out of the repository directory.
- The SQL adds one admin invitation that expires 72 hours after you print it.
  Apply it soon after you print it. It inserts nothing if an active admin or an
  open bootstrap invitation exists.
- The SQL has no `BEGIN` or `COMMIT`, because D1 rejects them. Each statement
  checks its own conditions.
- The person signs in with Google. The first protected request claims the
  invitation only if Google reports a verified email that matches. A bootstrap
  invitation cannot be claimed while an active admin exists.
- Check the result with `node scripts/reviewer-admin.ts list --print-sql` and
  `void db execute --remote`.

## Failure handling

| Failure                              | State                              | Action                                                                     |
| ------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------- |
| Preflight fails                      | No change                          | Fix the code in a new reviewed commit.                                     |
| Deploy log shows provisioning        | D1 replication can be on           | Stop. Read the D1 settings. Report before any other action.                |
| Migration fails                      | Some migrations can be applied     | Stop. Do not deploy older code. Fix the migration in a new commit.         |
| First-deploy readiness fails         | The failed version is active       | Inspect `void project status` and logs. Report before a retry.             |
| DNS or TLS not ready at first deploy | Worker active, check timed out     | Check the Custom Domain in Cloudflare. Retry once `/__void/ready` answers. |
| Later readiness fails                | Old version active                 | Inspect the candidate. Fix and redeploy.                                   |
| `triggers-failed`                    | Traffic can be restored or unknown | Inspect routes and the active version before a retry.                      |
| Gate 10 fails                        | New version active                 | Treat staging as unsafe. Report. Do not invite reviewers.                  |

A failed job does not prove that the old version is active. Always read the
active version. To stop all staging traffic, detach the `app.kawal.id` Custom
Domain. That is a DNS change and needs approval. Rollback does not reverse D1
migrations. Rollback can restore removed content, so it is not a withdrawal
procedure.

## Out of scope

- Real reports, ingestion, publication, withdrawal, media, and backups.
- An automatic or GitHub Actions app deployment.
- Changes to the public Worker, `kawal.id`, `www`, or option B.
