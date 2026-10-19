# Local development without a cloud account

The public and app targets can run without a Cloudflare account, API token,
Google client, NASA key, or production database. The app still uses Cloudflare
software: Miniflare and workerd run local Workers, D1, and R2. This is not a
replacement Node.js backend, and it does not prove remote Cloudflare behavior.

## Install

Use Node.js from `.node-version`, pnpm from `package.json`, and Vite+ from
`.vite-plus-version`. Install the pinned Vite+ with its
[official installer](https://viteplus.dev/guide/global-cli). Review an installer
before running it. Then, from the repository root:

```sh
vp env install
vp install --frozen-lockfile
pnpm check
```

The first install needs network access to download tools and packages. This is
not a claim that setup works offline. Do not run a Cloudflare login, connect,
deploy, provision, remote migration, or remote database command for development.

## Run

Run each command in a separate terminal:

```sh
pnpm dev
```

```sh
pnpm dev:app
```

Use each server's printed address. The public page has synthetic data. The app
uses local Miniflare state and applies its local migrations on startup. Each
checkout has separate state under `apps/app/.void`. No production database is
used. `/healthz` checks a local D1 query and an R2 list; it returns
`{"status":"ok"}` when both work.

Do not delete local state that you need. It is ignored by Git, not a backup.
Tests instead use disposable directories and remove their own state.

### Auth without credentials

Without Google credentials, the app has no working social sign-in. This is
intentional: sign-in requests return 404, and protected records stay unavailable.
The health check does not need sign-in. Do not add a development sign-in route
to application code or use staging credentials to bypass this boundary.

`pnpm test` builds the real Worker and uses the test-only Google substitute in
`tests/support/app-runtime.ts`. It tests sessions, invitations, grants, and the
private workflow present on the checked-out revision. It denies outbound auth
requests unless a test supplies the synthetic handler. Live Google integration
needs a separately approved client, callback registration, and invited member.
Those live checks are not needed for normal tests or public development.

## Static checks

Install Caddy at the version in `.caddy-version` if you need the static-origin
check. Build, serve the public export, and check the printed local origin:

```sh
pnpm build
pnpm public:serve
```

In another terminal, run `node scripts/check-public.mjs <static-origin-url>`.
Stop the app and public dev servers first. Caddy serves only
`apps/public/dist/client`; it has no app proxy or database access.

## Optional local seed data

Two commands download real public data for local inspection. Normal setup,
tests, and builds do not run them and do not read their output. Use Node.js 24.
Neither command needs an account or a key.

```sh
pnpm seed:firms
pnpm seed:dem
pnpm seed:landcover
pnpm seed:features
```

- `seed:firms` downloads the keyless NASA FIRMS 7-day VIIRS NRT files for
  NOAA-20 and NOAA-21 (South-East Asia region). It keeps the detections in
  Indonesia from the last 168 hours. It writes
  `.data/seed/firms/viirs-indonesia-7d.json` and the raw CSV files. The fields
  follow C2 in the [satellite-release proposal](plans/reliable-satellite-release.md).
  Detections have no province, because no province boundary is approved.
- `seed:dem` downloads the Copernicus DEM GLO-90 tiles that touch Indonesia
  from the AWS Open Data bucket (about 360 tiles, 0.9 GB) into
  `.data/seed/dem/cache/`. It then writes one 30″ (about 0.9 km) Int16 grid
  masked to Indonesia, a JSON description, and a PNG preview. A later run
  reuses each cached tile that has a matching SHA-256.
- `seed:landcover` reads ESA WorldCover 2021 (v200) for Indonesia. For each
  3-degree tile, it reads only one internal overview of about 150 m with HTTP
  range requests (about 15 MB in total), not the 10 m file. It keeps the
  overviews in `.data/seed/landcover/cache/` and writes a 30″ grid of the
  majority class, masked to Indonesia.
- `seed:features` downloads Natural Earth 1:10m rivers, lakes, and populated
  places (version 5.1.2, public domain) and keeps the features in Indonesia.

With `pnpm dev`, `/rancangan/d/indonesia` shows the seeds on a 3D map. A
development-server plugin provides the data. The static build does not contain
it and shows that the data is unavailable. When the view is narrower than about
450 km, the plugin makes a 2° × 2° detail patch at 6″ (about 185 m) from the
cached GLO-90 tiles and WorldCover overviews.

Obey these rules:

- `.data/` is ignored by Git. Do not commit or publish seed files. Do not copy
  them into `apps/public`, a fixture, a test, or a snapshot. Public pages keep
  synthetic data.
- The Indonesia filter uses the simplified Natural Earth outline in
  `app/design/map-geometry.ts` with a 10 km coastal buffer. A point near a
  coast or a land border can be in the wrong country. Small islands that are
  not in the outline are excluded.
- A satellite detection is not a confirmed fire. Check the FIRMS
  acknowledgement text before any public use.
- GLO-90 is a surface model: in forest, a height can show the top of the
  canopy. WorldCover is a 2021 classification: plantations are usually in the
  tree class. Natural Earth 1:10m lines are generalized for a national map.
  Check the WorldCover licence (reported as CC BY 4.0) before any public use. [ADR 0010](adr/0010-terrain-elevation-source.md) is a proposal. It
  does not permit publication of tiles or derived files.

## Amp orbs

Use `.agents/setup`, then `amp orb services ensure`. Share its returned portal
URLs, not loopback addresses. Run toolchain commands in a login shell
(`bash -lc`). These Amp commands are not required on a contributor's machine.

## Checked boundary

On 17 October 2026, a clean worktree at
[`8dc66a8`](https://github.com/kawaltech/kawal.id/commit/8dc66a8db2b80a37afec6161245abbb3814e9c18)
started both native dev servers with an empty home directory, no local state,
and provider/Cloudflare credential variables removed. It reused installed,
locked dependencies. The app applied two local migrations, health returned
200 with `{"status":"ok"}`, the public page returned 200, and Google sign-in
returned 404. This verifies credential-free runtime startup in a Linux orb,
not a fresh package download, every host OS, live OAuth, or remote deployment.

A later check on the local readiness branch, based on merged
[`7b52b3c`](https://github.com/kawaltech/kawal.id/commit/7b52b3cf99ec855b467bb60fb960c5c30e542899),
used an isolated source copy, an empty home, and an allowlisted environment
with no provider credentials. This time setup downloaded the pinned tools and
installed the locked dependencies. Cold setup took 20 seconds; a second run
took 11 seconds, including 5 seconds for the warm install. Resume took
0.48 seconds. A clean login shell selected Node.js 24.22.0 and pnpm 10.11.0.

The first `pnpm check` failed because a test's second login shell lost Vite+
when building outside the checkout. The harness now invokes the installed
Vite+ CLI with the running Node.js binary, without a second shell.
The same clean-home check then passed all 101 tests, types, lint, both builds,
and all five public HTML/JSON pairs.

Both supervised dev servers started. The app applied all three local
migrations, health returned 200 with `{"status":"ok"}`, and missing-Google
sign-in returned 404. Public development returned 200 with the app stopped.
With both dev servers stopped, Caddy passed the complete public HTTP checks.
No Cloudflare login, account, token, remote migration, or deployment was used.
This is Linux-orb evidence, not a check of every contributor OS or live OAuth.
