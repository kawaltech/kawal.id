# Open-source readiness

Status: preparation in progress. The repository is still private. This record
does not authorize a visibility change, merge, or deployment. The owner approved
MIT licensing and a readiness-branch push with a draft PR.

## Publication gates

| Gate                      | State and next action                                                                                                                                                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project license           | MIT approved by the owner. The root `LICENSE` and all three workspace manifests record it. Third-party material keeps its own terms.                                                                                                                       |
| Contributor entry point   | `CONTRIBUTING.md`, the document index, local development guide, issue forms, PR template, and agent handoff prompt are prepared on this branch. GitHub Issues remain the backlog.                                                                          |
| Security reporting        | `SECURITY.md` is prepared. Confirm a working private reporting channel before publication. The API read returned 404; it did not establish that private reporting is enabled.                                                                              |
| Third-party rights        | Retain the Cukup MIT notice for adapted CSS. Review dependency notices for each distributed bundle, not only repository source.                                                                                                                            |
| History disclosure        | Owner review required for Git author metadata, internal Amp links, and the real-access timing record in `docs/app-staging.md`. Removing a current link does not remove it from history.                                                                    |
| Historical sample data    | Owner must confirm provenance and approve disclosure of historical `app/data/reports.json`, introduced at `62b3ec3`. The history calls it dummy data, but it describes allegations at real places. Do not treat that label alone as proof of provenance.   |
| Hosted material           | Review issues, PR text, Actions logs/artifacts, secret scopes, and repository settings before visibility changes. The source audit did not cover them.                                                                                                     |
| Fork workflow             | Canonical-repository guards are prepared for deployment and post-deployment steps. Actions and both Vite+ bootstrap scripts are pinned to source commits. Fork and PR checks need no deployment token. Keep the latest-main and documentation-only guards. |
| Local development         | Public and app dev passed with cleared credentials, an empty home, and fresh local state. See the checked boundary in `development.md`.                                                                                                                    |
| Known dependency advisory | One moderate esbuild advisory needs a supported update or a documented risk decision. See below.                                                                                                                                                           |
| Incoming PR listener      | Deferred by the owner. No subscription is installed or required for this readiness PR.                                                                                                                                                                     |
| Final publication         | Review the final integrated revision and get explicit approval for the visibility change. Code readiness does not grant permission to accept real reports.                                                                                                 |

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

The dependency audit reported moderate advisory
[GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)
for esbuild 0.18.20 through Void's Drizzle tooling. Vulnerable dev-server use was
not demonstrated. A fresh audit still reports this advisory, and the registry
still lists Void 1.1.11 as the latest release. Do not use a forced transitive
upgrade without checking Void compatibility. Resolve this with a supported
update or an explicit risk decision before publication. Do not expose a local
development server to an untrusted network.

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

These changes need review and merge before they are part of default-branch
clones. No repository visibility, workspace membership, listener, or remote
application resource changed during the local checks.

## PR listener

The owner deferred the listener after the workspace-context check failed.
No listener, replacement polling schedule, or per-PR orb spawner is configured.
This is not a publication gate. Use GitHub's issue, PR, and CI pages for review
until the owner requests another setup.
