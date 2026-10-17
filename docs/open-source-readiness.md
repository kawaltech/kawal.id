# Open-source readiness

Status: the owner authorized open-source publication on 17 October 2026.
The readiness changes were merged in [PR #7](https://github.com/kawaltech/kawal.id/pull/7).
The owner made the repository public. An unauthenticated API read confirms
`private: false`, `visibility: public`, default branch `main`, and license `MIT`.
The unauthenticated repository page returns HTTP 200. Private vulnerability
reporting is enabled: a follow-up GitHub API read returns `enabled: true`.
Publication does not authorize app deployment,
remote migrations, real-data intake, or shared-history changes.

The authorized visibility-change request returned HTTP 403, `Resource not
accessible by integration`; the owner completed that change in GitHub Settings.
The private-reporting enable request also returned HTTP 403. The owner enabled
it under Settings → Advanced Security, and the API confirmed the new state.
Do not infer setting-write permission from `admin: true`. No alternate
credential was used. No test vulnerability report was submitted.

## Publication gates

| Gate                      | State and next action                                                                                                                                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project license           | MIT approved by the owner. The root `LICENSE` and all three workspace manifests record it. Third-party material keeps its own terms.                                                                                                                     |
| Contributor entry point   | `CONTRIBUTING.md`, the document index, local development guide, issue forms, PR template, and agent handoff prompt are merged. GitHub Issues remain the backlog.                                                                                         |
| Security reporting        | GitHub private vulnerability reporting is enabled. The owner changed the setting and a follow-up API read returned `enabled: true`. Repository maintainers receive reports through GitHub.                                                               |
| Third-party rights        | Retain the Cukup MIT notice for adapted CSS. Review dependency notices for each distributed bundle, not only repository source.                                                                                                                          |
| History disclosure        | The owner authorized publication of this repository with its history. This exposes Git author metadata, existing Amp links, and staging timing records. It does not change linked services' access permissions. No history rewrite is planned.           |
| Historical sample data    | The owner confirmed on 17 October 2026 that historical `app/data/reports.json` is entirely synthetic and safe to publish, including references to real places.                                                                                           |
| Hosted material           | A hosted snapshot passed the secret scan below. Repository settings and secret scopes remain unverified where the integration lacks permission. This scan does not prove that the material has no private data.                                          |
| Fork workflow             | Canonical-repository guards are merged for deployment and post-deployment steps. Actions and both Vite+ bootstrap scripts are pinned to source commits. Fork and PR checks need no deployment token. Keep the latest-main and documentation-only guards. |
| Local development         | Public and app dev passed with cleared credentials, an empty home, and fresh local state. See the checked boundary in `development.md`.                                                                                                                  |
| Known dependency advisory | The legacy loader's esbuild edge now uses 0.28.2. The dependency audit reports no known vulnerabilities. Migration generation and the full check pass. See the compatibility limits below.                                                               |
| Incoming PR listener      | Deferred by the owner. No subscription is installed or required for this readiness PR.                                                                                                                                                                   |
| Final publication         | Public repository access, `main`, and the MIT license are verified without credentials. The checked local contributor links resolve. Private vulnerability reporting is enabled. Real reports remain blocked.                                            |

Do not rewrite shared history without an approved plan. If disclosure is not
acceptable, agree a history-removal or clean-public-history plan before making
the repository public. A new source commit alone cannot remove old disclosures.

## Source audit evidence and limits

The read-only audit covered main at
[`8dc66a8`](https://github.com/kawaltech/kawal.id/commit/8dc66a8db2b80a37afec6161245abbb3814e9c18)
and the pushed private-report branch at
[`a235996`](https://github.com/kawaltech/kawal.id/commit/a235996d27fdf361a0a0cef004c26b36620109b9).
Gitleaks 8.30.1 found zero matches in history patches, all 303 unique reachable
file blobs, and commit messages across 35 reachable commits. The patch scan
covered 34 non-empty commits; the PR head is empty. Manual checks found no
confirmed live credential, private report, or tracked database/log/backup/capture.
Resource IDs, hosts, bucket names, and version IDs are identifiers, not credentials.

This is not proof that no secret ever existed. It excludes unreachable objects,
hosted material, and later commits. The audit confirmed the known private-save
metadata defect in the old PR head. The fix was merged in
[PR #1](https://github.com/kawaltech/kawal.id/pull/1). Its final head and merged
main passed 101 tests, both builds, and static HTTP checks. The separate local
recovery integration passed 107 tests; that harness and its proposal remain
local and are not part of PR #1. Review and scan the final integrated revision
before publication.

Before the license addition, the readiness follow-up also ran Gitleaks 8.30.1
on this branch's reachable history, each unique reachable file blob, commit
messages, and the then-current source files. All three scans found zero
matches. The same exclusions and
manual disclosure gates still apply. In particular, a secret scan cannot
establish sample-data provenance or permission to publish personal metadata.

The Actions permission-settings endpoints returned 403 during this follow-up.
Their state is not verified. An owner must check default token permissions,
fork approval settings, repository secrets, and protected-branch rules in the
GitHub UI. Do not infer those settings from the checked-in workflow alone.

The dependency audit originally reported moderate advisory
[GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)
for esbuild 0.18.20 through Void's Drizzle tooling. The affected feature is the
esbuild development server. The legacy
[core-utils 3.3.2 source](https://github.com/esbuild-kit/core-utils/blob/v3.3.2/src/transform/index.ts)
uses `transform`, `transformSync`, and `version`, not the server API. A scoped
override now makes only `@esbuild-kit/core-utils@3.3.2>esbuild` use 0.28.2, already
used by the main toolchain. It removes the vulnerable copy from the lockfile;
it does not suppress the advisory or change Void's version.

This override exceeds the legacy loader's declared esbuild range. Both transform
APIs and their options remain available. The pinned Node.js 24 meets the newer
runtime requirement. Local probes through the actual dependency edge passed
TypeScript transforms, define-style class fields, dynamic import, source maps
with spaces in the source path, and synchronous CommonJS/`import.meta.url`.
`void db generate` reported no schema changes. `pnpm check` passed all 101 tests,
types, lint, both builds, and the five public HTML/JSON pairs. `pnpm audit`
reported no known vulnerabilities. These are Linux-orb checks, not proof of
all source syntax or every contributor OS. Review or remove the override when
Void replaces the deprecated loader. Do not expose a local development server
to an untrusted network.

The 17 October hosted snapshot contained seven issue/PR records, two PRs,
fourteen issue comments, logs from twenty-seven workflow runs, and eleven
retained Docker build artifacts. The artifacts predate the native Void
migration. Gitleaks 8.30.1 found zero matches in the downloaded text, archived
logs, and artifact text. The scan included 87 text streams from the artifacts'
decoded archives, with up to four archive and decoding levels. The scanner
binary's release checksum was verified before use. The scanner's own release
files and sample credentials were outside the hosted scan input.

This scan does not validate every binary field or establish permission to
publish private data. Some issue text and comments contain Amp links. Hosted
material created after the snapshot and remote settings remain outside this
check. No artifact, workflow run, or comment was deleted. Keep owner disclosure
review separate from secret detection.

## Local readiness evidence

- The clean-home `pnpm check` passed 101 tests, types, lint, both builds, and
  all five public HTML/JSON pairs after the test-launch correction. Cold and
  warm setup and local dev checks are recorded in [development](development.md).
- Eight repository/event/branch contexts passed the workflow-condition check.
  A fork with forged successful step outputs still cannot deploy. The
  documentation-only and superseded-revision controls still block deployment.
  The old deployment condition admitted the fork output-bypass control.
- Both issue forms passed local YAML and required-field checks. Relative
  contributor-document links resolved. These checks do not replace a GitHub
  UI check after an approved push.
- The Cukup notice is included in both targets. Keep distribution-specific
  dependency notice review as a separate gate.

These changes are merged and available in default-branch clones. No repository
visibility, workspace membership, listener, or remote application resource
changed during the local checks.

## Public deployment evidence

The main workflow after [PR #8](https://github.com/kawaltech/kawal.id/pull/8)
[passed](https://github.com/kawaltech/kawal.id/actions/runs/39047429801).
Both controlled public hosts passed the expected-version and full static HTTP
checks. The active public version is `c8ea92cb-d755-4d66-b46d-e66028ab3bcb`.
Native readiness logs show the old healthy version on attempts 1–3 and the
candidate on attempt 4. This proves routing delay in this run, not the cause
of the earlier failed run. The safe diagnostic patch changes no readiness
budget, version check, activation, or restoration rule. App staging is unchanged.

## PR listener

The owner deferred the listener after the workspace-context check failed.
No listener, replacement polling schedule, or per-PR orb spawner is configured.
This is not a publication gate. Use GitHub's issue, PR, and CI pages for review
until the owner requests another setup.
