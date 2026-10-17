# Security policy

## Report privately

Do not report a vulnerability, leaked credential, private report, or personal
data in a public issue or pull request. Do not include such data in an agent
prompt, screenshot, or build log.

If GitHub shows **Report a vulnerability** on this repository's Security page,
use [private vulnerability reporting](https://github.com/kawaltech/kawal.id/security/advisories/new).
If that option is not available, contact a repository maintainer through an
existing trusted private channel and ask for a secure reporting channel before
you send details. Do not assume an email address from the project domain.

Give the affected revision, a short impact statement, and minimal synthetic
reproduction steps. Do not test against `kawal.id`, `app.kawal.id`, or shared
Cloudflare resources without specific permission. Do not access another person's
records, use a leaked token, or copy live data to prove a problem.

Before publication, the maintainers must name a private fallback channel and
the person who receives reports. GitHub's private reporting feature is for
public repositories: enable it during the approved publication procedure and
verify the reporting form before announcing the project. See
[GitHub's setup guide](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository).
No response-time promise or bounty is offered.

## Supported code and limits

Security fixes target the current `main` branch. This project is a development
foundation and synthetic preview, not a production reporting service. Older
revisions have no separate support promise. Use the current ADRs and operations
guide for the release gates.

The public target is static. The private app uses native Void auth and access
grants. Normal local checks do not need production credentials or records.
Real reports remain blocked until recovery, retention, erasure, and access
controls meet the accepted release rules. Approval of a private report does
not publish it.

If a live credential is found, stop its use and tell a maintainer privately.
Removing it from the current file is not enough: the owner must revoke or rotate
it and review history, logs, artifacts, and other copies. Do not rewrite shared
history or perform a remote rotation without approval.
