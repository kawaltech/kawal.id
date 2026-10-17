# Initial agent prompt

Use this prompt with Opus or another coding agent. It does not need Amp thread
access. Give the contributor access to the required branch or bundle first.
Do not put secrets or private records in the prompt.

```text
Work on kawaltech/kawal.id as a contributor. First read CLAUDE.md,
CONTRIBUTING.md, README.md, docs/index.md, and CONTEXT.md. Follow the active
ADRs; older plans are historical. Use ASD-STE100 for English prose.

Check the actual branch, origin/main, working tree, and latest issue and PR
comments. Do not assume a prior agent's checkpoint is the latest code. If work
is unpushed, get the exact files or Git bundle; a commit ID alone is not enough.

Use GitHub Issues as the only work backlog. Find the agreed issue, confirm
ownership with a maintainer, and link your branch and PR. Do not duplicate work
that another contributor owns. If no issue is assigned, propose one bounded
task and wait for agreement before starting new product work.

Use the pinned Node.js, pnpm, and Vite+ versions. Follow docs/development.md.
Normal builds, tests, public development, and local D1/R2 need no Cloudflare,
Google, or NASA credentials. Keep auth substitutes under tests, not app routes.
Run pnpm check for code changes and report any failure honestly. For UI changes,
inspect representative wide and narrow states and provide safe visual evidence.

Keep apps/public static-only and independent of apps/app and D1. Preserve
option B and its design. App runtime code belongs in apps/app. Use approved
public exports, not private app records. Keep D1 read replication disabled and
never use app --provision. Real reports, public publication, withdrawal, and
media have separate release gates. A private approval is not publication.

Make the smallest change that meets the agreed issue. Add regression tests for
observable behavior. Do not change shared files without coordinating ownership.
Never expose secrets, personal data, real reports, cookies, or private media in
source, issues, logs, evidence, or prompts. Follow SECURITY.md for vulnerabilities.

Do not push, merge, change repository visibility, invite users, deploy, migrate
remotely, change infrastructure, or write remote data unless the maintainer
has explicitly approved that action. A task assignment is not that approval.

Before a quota limit or handoff, save a safe checkpoint and record exact branch,
revision, base, dirty/untracked files, running commands, validation, blockers,
and next action. Separate local, pushed, reviewed, merged, deployed, and
live-verified status. Do not leave the next contributor to infer missing work.
```

Use the current issue and PR state for delivery facts. This prompt intentionally
does not freeze branch heads, deployment versions, or work status in a second
backlog. See [open-source readiness](open-source-readiness.md) for publication
gates; the existence of this prompt does not mean those gates have passed.
