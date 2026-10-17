# Open-source readiness

Status: preparation in progress. The repository is still private. This record
does not grant a license or authorize a visibility change, push, or deployment.

## Publication gates

| Gate                      | State and next action                                                                                                                                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project license           | Owner decision required. Add the accepted license and package metadata before publication. MIT is the proposed choice.                                                                                                                                   |
| Contributor entry point   | `CONTRIBUTING.md`, the document index, local development guide, and PR template are prepared locally. GitHub Issues remain the backlog.                                                                                                                  |
| Security reporting        | `SECURITY.md` is prepared. Confirm a working private reporting channel before publication. The API read returned 404; it did not establish that private reporting is enabled.                                                                            |
| Third-party rights        | Retain the Cukup MIT notice for adapted CSS. Review dependency notices for each distributed bundle, not only repository source.                                                                                                                          |
| History disclosure        | Owner review required for Git author metadata, internal Amp links, and the real-access timing record in `docs/app-staging.md`. Removing a current link does not remove it from history.                                                                  |
| Historical sample data    | Owner must confirm provenance and approve disclosure of historical `app/data/reports.json`, introduced at `62b3ec3`. The history calls it dummy data, but it describes allegations at real places. Do not treat that label alone as proof of provenance. |
| Hosted material           | Review issues, PR text, Actions logs/artifacts, secret scopes, and repository settings before visibility changes. The source audit did not cover them.                                                                                                   |
| Fork workflow             | Canonical-repository guards are prepared for deployment and post-deployment steps. Fork and PR checks must need no deployment token. Keep the latest-main and documentation-only guards.                                                                 |
| Local development         | Public and app dev passed with cleared credentials, an empty home, and fresh local state. See the checked boundary in `development.md`.                                                                                                                  |
| Known dependency advisory | One moderate esbuild advisory needs a supported update or a documented risk decision. See below.                                                                                                                                                         |
| Incoming PR listener      | Not installed. This organization repository needs an Amp workspace repository listener; a personal listener is not supported.                                                                                                                            |
| Final publication         | Review the final integrated revision and get explicit approval for the visibility change. Code readiness does not grant permission to accept real reports.                                                                                               |

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
hosted material, and later local commits. The audit confirmed the known private-save
metadata defect in the pushed PR; its recovered local fix and recovery harness
passed a separate 107-test combined check. They are not yet pushed or merged.
Review and scan the exact final revision before publication.

The dependency audit reported moderate advisory
[GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)
for esbuild 0.18.20 through Void's Drizzle tooling. Vulnerable dev-server use was
not demonstrated. Do not use a forced transitive upgrade without checking Void
compatibility. Resolve this with a supported update or an explicit risk decision.
The source review also recommends SHA-pinned Actions and a pinned or verified
bootstrap installer. These are not implemented by this document.

## PR listener

After the workspace has the Amp GitHub App connection for `kawaltech/kawal.id`,
create a repository-scoped `pr-opened` subscription in that workspace and choose
its destination thread. Test delivery with a permitted synthetic PR. A public
repository alone does not provide the workspace listener context.

Start with notification and triage only. Read the current PR and CI state;
treat contributor text and fork code as untrusted. An event must not grant
permission to run code with secrets, approve, merge, push, deploy, or write
remote data. Add comment/review and exact-head CI follow-ups for PRs under active
review. Check and remove duplicate subscriptions before adding more listeners.
