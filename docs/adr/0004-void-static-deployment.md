---
status: accepted
date: 2026-10-16
---

# Use Void to deploy public static files

Keep React Router, Node.js, and Vite+. Use Void as the deployment layer for the
public static build on Cloudflare. The user accepted this scope on 16 October 2026. This does not move editorial work, SQLite, sessions, or private media to
Cloudflare.

React Router builds the HTML and navigation data. Void deploys only
`build/client`, not the server bundle or local data. Use its explicit static app
type, without `voidPlugin()`, framework inference, ISR, or an SPA fallback.
Keep missing pages, data files, and editorial endpoints as 404 responses.

Void provides a deployment workflow and asset routing without replacing our
framework. Version 1.1.11 adds a small routing Worker before Workers Assets,
rather than an assets-only upload. This Worker applies redirects and headers;
it must not render the application or read a database. Its requests are subject
to Worker quotas. Review those limits before public release.

## Boundaries

- The current target is the existing synthetic design preview Worker. Keep its
  exact root redirect to option B, custom domain, warnings, and `noindex`.
- Keep the accepted cache classes from ADR 0002. Do not treat Void's defaults
  or a successful deployment as proof of cache expiry, purge, or stale delivery.
  Its direct-deployment ISR purge is not a zone-wide edge purge, so do not use
  ISR for report withdrawal.
- Public file updates must not require an editorial application restart. The
  controlled publication and withdrawal workflow is still unimplemented.
  Before reports are published, prevent an asset rollback from restoring
  withdrawn content and verify removal from every controlled public target.
- Keep Caddy for independent local static checks. Docker and Kamal remain the
  accepted editorial deployment plan. A Cloudflare-native editorial system is
  only [proposed in ADR 0005](0005-cloudflare-editorial.md).
- Pin the CLI in the lockfile. Normal orb development and tests must not require
  Cloudflare credentials. Keep credentials and generated local state out of Git.
  Do not enable automatic deployments or create a Void team platform.

The live preview predates this configuration. A Void deployment requires an
authenticated CLI, an existing-Worker handoff, and HTTP checks of its final
output. Adding the configuration does not establish that this handoff passed.

## References

- [Prebuilt static sites](https://void.cloud/guide/app-types)
- [Static asset caching](https://void.cloud/guide/edge/static-assets)
- [Direct Cloudflare deployment and ISR limits](https://void.cloud/integrations/cloudflare)
- [Independent assessment](https://ampcode.com/threads/T-01a145ab-fb67-71e4-abd1-a67b28dd4880)
