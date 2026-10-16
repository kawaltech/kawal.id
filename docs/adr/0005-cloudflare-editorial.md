---
status: proposed
date: 2026-10-16
---

# Consider Cloudflare for editorial processing and storage

Consider Workers for editorial requests, D1 for records and sessions, and R2 for
private originals and public copies. This could remove server maintenance.
It would also replace the accepted local SQLite and filesystem deployment with
Cloudflare-specific services. No migration is accepted or authorized by this ADR.

Keep React Router either way. The accepted Void deployment layer in ADR 0004
does not require its database, storage, authentication, or ISR APIs. Keep the
Node.js, SQLite, local-file, Docker, and Kamal plan until this proposal is accepted.

Before a decision, test two independent orbs with separate local D1 and R2 state,
no production credentials, and the pinned React Router and Vite+ versions.
Compare request limits, operating costs, backup and restore, media access,
Google sign-in, and the cost of leaving Cloudflare. Keep public reads static and
independent of editorial requests. Retain ADR 0002's publication, correction,
and withdrawal rules; a regional ISR invalidation is not a confirmed global purge.

If this proposal is accepted, choose Void's runtime integration or the standard
Cloudflare Vite plugin after a local compatibility check. Do not select either
only because Void already deploys our public files.

## References

- [Local D1 development](https://void.cloud/guide/database/d1)
- [React Router integration](https://void.cloud/integrations/frameworks/react-router)
- [Direct deployment cache limits](https://void.cloud/integrations/cloudflare)
