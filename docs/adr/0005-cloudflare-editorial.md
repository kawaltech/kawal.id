---
status: superseded by ADR-0004
date: 2026-10-16
---

# Close the separate Cloudflare editorial proposal

The user accepted the full native Void stack after this proposal was written.
[ADR 0004](0004-void-static-deployment.md) now includes native editorial pages,
Workers, D1, R2, and future Void authentication. React Router and Docker/Kamal
are no longer the selected foundation. No product records need migration.

Keep public reads static and separate from editorial requests. The local runtime
checks and release gates belong to ADR 0004 and the operations guide. This closed
proposal does not authorize deployment or shared infrastructure changes.
