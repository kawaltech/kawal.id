# Contribute to Kawal Asap

Start with the [README](README.md), [document index](docs/index.md), and
[domain terms](CONTEXT.md). The public page uses the accepted option B design.
Do not start a redesign or restore the old stack.

## Find work

Use [GitHub Issues](https://github.com/kawaltech/kawal.id/issues) for work status
and ownership. Use pull requests for review. We do not use Beads or a second
backlog. The [document index](docs/index.md#work-and-ownership) links the current
work packages. An open issue is not necessarily ready or unassigned; read its
latest comments before you start.

Comment on an issue with your proposed scope before you start. A maintainer
must confirm one accountable contributor. Link your branch, pull request, and
agent thread if used. Agree file ownership before parallel work. For a new
feature, agree the scope and acceptance checks in an issue first.

## Develop and check

Follow [local development](docs/development.md). It needs no Cloudflare account,
Google client, NASA key, or production records. Tests use temporary local state
and synthetic identities. Live Google sign-in is a separate integration.

```sh
pnpm check
```

This command checks types, lint, tests, both native builds, and public prerender
completeness. Keep the public target static and independent of the app and D1.
Use existing patterns and the smallest change that meets the agreed scope.
Add tests for observable behavior. For a UI change, inspect the affected states
at a wide and narrow width; attach safe screenshots or an interaction clip.

## Send a pull request

1. Fork the repository or use a permitted branch. Do not work on `main`.
2. Link the issue. State what changed, why, and what is outside the change.
3. Give the exact check command and result. State any check that could not run.
4. Identify migrations, dependency changes, and changes to security or privacy.
5. Keep decisions in ADRs, terms in `CONTEXT.md`, and procedures in runbooks.
6. Request review. Do not merge your own unreviewed change.

Pull-request checks need no deployment secret. They do not deploy. The canonical
repository can deploy a checked public preview after a code push to `main`.
App deployment, remote D1 writes, migrations, invitations, and infrastructure
changes are separate operations. A contribution or issue assignment does not
authorize them. Never use app `--provision`.

Do not put secrets, personal data, real reports, private media, database copies,
or auth cookies in code, issues, logs, screenshots, or agent prompts. Use the
[security policy](SECURITY.md) for a suspected vulnerability, not a public issue.
Keep third-party license notices. Do not add material with unclear reuse rights.
Use ASD-STE100 Simplified Technical English for English prose. App UI language
and domain rules follow the accepted ADRs.

## Hand off unfinished work

Commit a safe local checkpoint. Record the branch, exact revision, base, dirty
and untracked files, commands still running, check results, blockers, and next
action. State whether the work is local, pushed, reviewed, merged, or deployed.
Transfer unpushed files or a Git bundle through a private channel; a commit ID
alone does not transfer work. Get approval before a push or remote action that
is outside your existing permission. The next contributor must check the actual
checkout and issue state before continuing. See the
[agent handoff prompt](docs/contributor-handoff.md).
