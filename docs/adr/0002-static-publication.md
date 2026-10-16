---
status: accepted
date: 2026-10-16
---

# Serve public information from static publication files

Keep public reads independent of editorial requests, sessions, and database
access. Generate a complete approved-public export before activation. This
decision was amended for the full native Void stack in
[ADR 0004](0004-void-static-deployment.md). The earlier React Router, same-host
origin, export-symlink, and edge stale-on-error clauses no longer apply.

## Origin and generation

- Use a separate static-only Void public target. Native prerendering must produce
  HTML and `_void/pages/*.json` for every public page. Validate completeness and
  loader success because Void 1.1.11 can exit successfully after a prerender error.
- Keep Workers, D1, R2, sessions, and write endpoints in the separate editorial
  target. A public visit or native client navigation must not call it. Prove
  direct visits, navigation, and assets with editorial stopped.
- Generate only from an approved-public export. Direct Cloudflare SSG uses local
  Miniflare state, not production D1. Use synthetic fixtures in normal orbs. Never
  export session data, private originals, or unreviewed reports.
- Show source times and the last successful update. Keep the accessible table
  usable without the map. Missing data must not appear as zero detections.
- Keep private originals, approved public copies, backups, and public build
  files separate. Caddy's local document root is only `apps/public/dist/client`.
  There is no fallback or proxy to editorial.

## Publication and failure

Each public update is a deployment. Prepare and check a complete export first.
Serialize publication and reject an older export that could replace a newer
publication or restore withdrawn content. A failed normal generation keeps the
last valid export, with its timestamp. It must not claim current feed data.
Measure generation/deployment time and select a publication frequency before
release. This foundation does not implement the publication workflow.

## Cache policy and reliability

The local origin sends `public, max-age=60, must-revalidate` for pages and data.
Only hash-named code under `/assets/` gets a one-year immutable policy. Do not
include report content or private data in code assets. Editorial responses use
`private, no-store` and must not enter shared caches.

Void's routing Worker runs for public requests, including code assets. It has
compute limits and does not use the Cache API by default. Zone Cache Rules,
`s-maxage`, and `stale-if-error` do not establish edge caching in this path. The
previous five-minute freshness and 24-hour edge stale-on-error promise is
replaced by the last valid export and its timestamp. No measured production
cache guarantee exists yet. Test actual headers, hits, expiry, and failure
behavior before selecting a release policy. Do not enable Always Online or a
service worker that bypasses withdrawal rules.

Static files remove editorial and D1 from public reads. They do not remove the
asset host, routing Worker quota, network, or deployment system as failure
points. A cache is not a backup.

## Withdrawal gate

Real report publication is blocked until these controls exist and pass tests:

- Remove withdrawn content from every active page, navigation payload, list,
  search index, data export, and public media URL. Retire old URLs. Inactive
  deployment URLs must not provide a way to read withdrawn content.
- Prevent CLI rollback, dashboard rollback, and automatic readiness-failure
  restoration from restoring withdrawn reports. A failed publication that
  restores an older deployment must not undo a withdrawal.
- Confirm the active version through `/__void/ready` and check HTTP responses for
  missing content on every controlled hostname. Confirm any required cache purge
  by checking responses, not only the purge API result. A new hostname is another
  withdrawal target.
- Keep withdrawal pending if generation, activation, removal, or purge fails.
  Keeping the old export available is not successful withdrawal.
- Preserve the report limit of at most 60 seconds of browser/cache freshness,
  with revalidation after expiry and no stale-on-error delivery. A release policy
  must not extend it by mixing reports into longer-lived pages or immutable media.
- Do not use ISR as the report withdrawal mechanism. Its regional invalidation
  and stale response behavior do not prove removal from all public targets.

Open pages and copies already downloaded cannot be recalled. Do not promise both
unrestricted stale delivery and a fixed withdrawal deadline.

Before release, test concurrent publication, correction, withdrawal, failed
generation, and all rollback paths with fixtures. Agree recovery targets and
test database-plus-media restoration separately. No live feed or Google client
is required for these local foundation checks. Production deployment needs
separate approval.

## References

- [Native Void decision and source review](0004-void-static-deployment.md)
- [Cloudflare deployment limits](https://void.cloud/integrations/cloudflare)
- [Cloudflare default cache behavior](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/)
