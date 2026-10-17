# Kawal Asap

A native Void foundation for reviewed fire and smoke information. The public
preview preserves the selected map-and-table design, option B. All data is
synthetic. The app has Google-only sign-in and invitation-based reviewer
access. App staging is deployed, but this is not a production reporting
service. Private drafts and two-person review were merged in
[PR #1](https://github.com/kawaltech/kawal.id/pull/1); that workflow is not
deployed to app staging. Live ingestion, public reports, publication,
withdrawal, and media workflows are not implemented.

Read [ADR 0004](docs/adr/0004-void-static-deployment.md) for the full Void decision,
[ADR 0002](docs/adr/0002-static-publication.md) for static publication and withdrawal,
[ADR 0003](docs/adr/0003-map-and-table-public-design.md) for design, and the
[operations guide](docs/operations.md) before adding features.

## Contribute and find work

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the contributor workflow and
[docs/index.md](docs/index.md) for current decisions and remaining work in
[GitHub Issues](https://github.com/kawaltech/kawal.id/issues).
The [local development guide](docs/development.md) explains credential-free
startup and the test-only auth substitute. A copy-ready
[agent handoff prompt](docs/contributor-handoff.md) is also available.

Use [SECURITY.md](SECURITY.md) for private vulnerability reports. The repository
is being prepared for open-source publication. Project code is licensed under
the [MIT License](LICENSE); third-party material keeps its own terms. The final
disclosure and security-reporting checks are not complete. See the
[readiness gates](docs/open-source-readiness.md) and
[third-party notices](THIRD_PARTY_NOTICES.md). The software license does not
authorize access to private records or grant rights to future report content.

## Structure

| Path                             | Purpose                                                                |
| -------------------------------- | ---------------------------------------------------------------------- |
| `apps/public`                    | Native Void React, static HTML and navigation JSON; no backend         |
| `apps/app`                       | Native Void Workers, Google-only sign-in, reviewer access, local D1/R2 |
| `app/design`                     | Shared option B and review-page design code                            |
| `scripts/check-public-build.mjs` | Reject incomplete prerenders and report data in B                      |
| `config/Caddyfile`               | Serve only the public export for local checks                          |

Public reads do not call the app or a database. D1 is managed SQLite through
async bindings, not a local `better-sqlite3`/WAL database. R2 provides object
storage. Each checkout has its own ignored Miniflare state. Normal development
needs no Google, NASA, or Cloudflare credentials.

## Start in an Amp orb

Setup installs the pinned Vite+, Node.js, pnpm, Caddy, and locked dependencies,
then builds both targets. Resume checks tools without installing dependencies.

```sh
.agents/setup
pnpm check
amp orb services ensure
```

Use the returned portal URLs. `dev` runs public development. `app` runs the
local Workers runtime. `public` serves static files with Caddy. Stop `dev` and
`app` to test public independence. The project default is `a1.small`
(2 CPUs, 4 GB RAM). The combined build, services, and browser checks have passed
on `a1.medium`, not yet on small. This is not a production sizing claim. Run
toolchain commands with `bash -lc` in the orb.

## Start on another machine

Install the Vite+ version in `.vite-plus-version` with its
[official installer](https://viteplus.dev/guide/global-cli), then run:

```sh
vp env install
vp install --frozen-lockfile
pnpm check
pnpm dev
```

Install the pinned Caddy version separately if you need local static checks.

| Command                               | Purpose                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm dev`                            | Public native Void development server                                      |
| `pnpm dev:app`                        | App native Void development with local D1/R2                               |
| `pnpm check`                          | Types, lint, tests, and both builds                                        |
| `pnpm build`                          | Native `vp build` in both targets; validate the public export              |
| `pnpm format`                         | Format source files                                                        |
| `pnpm public:serve`                   | Serve `apps/public/dist/client` with Caddy                                 |
| `node scripts/check-public.mjs <url>` | Check public HTML, JSON, assets, isolation, and 404s                       |
| `pnpm deploy:preview`                 | Manual public preview deployment; requires approval and a Cloudflare token |

Both workspaces use Void and `@void/react` 1.1.11 and the Vite+ core alias.
The root `migrations/0001-users.sql` is historical and is not applied.

## Public preview deployment

The user approved public-only deployment after checks pass on a push to `main`.
GitHub Actions checks both targets, tests static reads with the app stopped,
then deploys only the checked public output. Pull requests do not deploy.
Documentation-only pushes also run checks, but skip deployment. This exception
never includes paths under `apps/` or `app/`. Main deployments cannot overlap;
a revision superseded by code is skipped. Post-deploy
checks require the exact active Worker version on `kawal.id` and Workers.dev.

The workflow needs the repository Actions secret `CLOUDFLARE_API_TOKEN`.
Enter it in GitHub's masked secret field, not in chat or source. See the
[operations guide](docs/operations.md#public-preview-deployment) for access and
failure handling. The first native deployment passed on 16 October 2026:
[workflow run](https://github.com/kawaltech/kawal.id/actions/runs/38948227220/attempts/2).
The app is not deployed by this workflow.

App staging uses `app.kawal.id`. See the
[staging preparation guide](docs/app-staging.md) before any remote work.
Normal orbs need no Google client. Runtime tests use temporary D1/R2 and a
test-only Google substitute; there is no application test sign-in route.
The owner's live Google sign-in, admin invitation claim, protected access, and
sign-out checks passed on staging. New secret writes, remote resources,
deployments, and invitations still need separate approval.

This is a synthetic preview, not report publication. The foundation does not
provide edge stale-on-error guarantees or a safe report rollback workflow.
Real reports remain blocked by the release gates in ADR 0002.
