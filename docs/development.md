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
