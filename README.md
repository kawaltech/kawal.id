# Kawal Asap

A native Void foundation for reviewed fire and smoke information. The public
preview preserves the selected map-and-table design, option B. All data is
synthetic. Sign-in, reports, live ingestion, publication, withdrawal, and media
workflows are not implemented.

Read [ADR 0004](docs/adr/0004-void-static-deployment.md) for the full Void decision,
[ADR 0002](docs/adr/0002-static-publication.md) for static publication and withdrawal,
[ADR 0003](docs/adr/0003-map-and-table-public-design.md) for design, and the
[operations guide](docs/operations.md) before adding features.

## Structure

| Path                             | Purpose                                                           |
| -------------------------------- | ----------------------------------------------------------------- |
| `apps/public`                    | Native Void React, static HTML and navigation JSON; no backend    |
| `apps/editorial`                 | Separate native Void Workers target with local D1/R2 health check |
| `app/design`                     | Shared option B and review-page design code                       |
| `scripts/check-public-build.mjs` | Reject incomplete prerenders and report data in B                 |
| `config/Caddyfile`               | Serve only the public export for local checks                     |

Public reads do not call editorial or a database. D1 is managed SQLite through
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

Use the returned portal URLs. `dev` runs public development. `editorial` runs the
local Workers runtime. `public` serves static files with Caddy. Stop `dev` and
`editorial` to test public independence. Use `a1.medium` (4 CPUs, 8 GB RAM) for
the combined build, services, and browser checks. This is not a production sizing
claim. Run toolchain commands with `bash -lc` in the orb.

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

| Command                               | Purpose                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm dev`                            | Public native Void development server                                    |
| `pnpm dev:editorial`                  | Editorial native Void development with local D1/R2                       |
| `pnpm check`                          | Types, lint, tests, and both builds                                      |
| `pnpm build`                          | Native `vp build` in both targets; validate the public export            |
| `pnpm format`                         | Format source files                                                      |
| `pnpm public:serve`                   | Serve `apps/public/dist/client` with Caddy                               |
| `node scripts/check-public.mjs <url>` | Check public HTML, JSON, assets, isolation, and 404s                     |
| `pnpm deploy:preview`                 | Deploy public preview; requires separate approval and CLI authentication |

Both workspaces use Void and `@void/react` 1.1.11 and the Vite+ core alias.
The root `migrations/0001-users.sql` is historical and is not applied.

No native Void deployment has been made. The existing live design preview is
unchanged. The foundation does not provide edge stale-on-error guarantees or a
safe report rollback workflow. Real report publication remains blocked by the
release gates in ADR 0002.
