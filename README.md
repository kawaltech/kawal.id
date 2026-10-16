# Kawal Asap

A self-contained application for reviewed fire and smoke information.
This repository currently contains infrastructure and a neutral static page.
It does not yet provide reports, live detections, sign-in, or a publication workflow.

Read [ADR 0001](docs/adr/0001-self-contained-kawal-asap.md),
[ADR 0002](docs/adr/0002-static-publication.md), and the
[operations guide](docs/operations.md) before adding features.

## Tools

- Node.js 24 LTS, pinned in `.node-version`.
- React Router Framework Mode, React, and TypeScript.
- Vite+ for Vite, tests, lint, formatting, and tool management.
- pnpm, pinned in `package.json`, with a committed lockfile.
- SQLite with WAL, SQL migrations, and local files.
- Caddy for a separate static public server.
- Docker targets and Kamal templates for one persistent host.

## Start in an Amp orb

Amp runs `.agents/setup` when no exact project snapshot is available. Setup
installs the pinned tools and locked dependencies, generates route types, and
prepares an independent `.data` directory with synthetic test identities.
It does not need Google, NASA, Cloudflare, or production credentials.
Resume checks tools without installing dependencies.

```sh
.agents/setup
pnpm check
amp orb services ensure
```

Use the returned portal URLs. The `dev` service runs React Router. The `public`
service builds and serves a static export with Caddy. Stop `dev` to check that
public reads still work. Neither service enables sign-in.

Use `a1.small` (2 CPUs, 4 GB RAM) as the initial development size. Use `a1.medium`
(4 CPUs, 8 GB RAM) for container builds or browser tests that run with the app.
These are starting recommendations, not measured production requirements.

## Start on another machine

Install the Vite+ version in `.vite-plus-version` with its
[official installer](https://viteplus.dev/guide/global-cli). Then run:

```sh
vp env install
vp install --frozen-lockfile
vp run db:seed
vp run dev
```

The database commands use Node.js type stripping. Do not run them with an older
Node.js version. To run the static server, also install the Caddy version in
`.caddy-version`, then run `vp run build`, `vp run public:init`, and
`vp run public:serve`.

## Commands

| Command                             | Purpose                                                   |
| ----------------------------------- | --------------------------------------------------------- |
| `vp run dev`                        | Run React Router with live reload                         |
| `vp run check`                      | Check types, lint, tests, and production build            |
| `vp run format`                     | Format supported source files                             |
| `vp run build`                      | Build the server and prerender public routes              |
| `vp run start`                      | Run the built editorial server; migrate first             |
| `vp run db:migrate`                 | Apply SQL migrations under a database write lock          |
| `vp run db:seed`                    | Add local test identities without changing existing roles |
| `vp run db:backup /path/new.sqlite` | Create a consistent database backup                       |
| `vp run public:init`                | Create the initial public export if none exists           |
| `vp run public:serve`               | Serve only the current static export                      |

Use `vp run build`, not `vp build`: React Router owns the framework build.
The same rule applies to `dev`. No visual design has been selected yet.
