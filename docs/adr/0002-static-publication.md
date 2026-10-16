---
status: accepted
date: 2026-10-16
---

# Serve public information from static publication files

Use SQLite for editorial records and generate a separate set of public files.
Use React Router prerendering for public routes and Cloudflare for public caching.
Serve public pages and data without a live database query or a Google session.
Use the cache and withdrawal periods below for the first implementation.

## Context

Public information should remain available if the editorial process fails.
Most public reads do not need a live application response. The user prefers
static public content and dynamic processing for editorial work.

This is a change from the initial per-request publication check in
[ADR 0001](0001-self-contained-kawal-asap.md). This decision replaces that check
for public reads. The static read path does not check SQLite on each request.
It must remove withdrawn content from public files and caches.

## Decision

- Keep the accepted Node.js, React Router, SQLite, and Kamal stack.
- Use one source of application code. Do not create a separate frontend project
  or a second database. Public file generation and editorial requests can share
  components and validation code.
- Use React Router's `prerender` configuration to enumerate public URLs. Its
  build generates HTML and client navigation data through route loaders. Read
  only approved public data during generation. Do not export editorial routes,
  session data, private originals, or unreviewed reports.
- Keep server rendering available for protected editorial routes. Do not disable
  it globally to make public pages static. The public server must serve generated
  HTML and navigation data without falling back to the editorial server.
- Generate HTML pages, JSON map data, and approved public copies. Include source
  times and the last successful data update. Keep the accessible table usable
  without the map. Filters can operate on exported data in the browser.
- Run generation after approved content changes and successful ingestion.
  A content change can require a generation build, but not a new application
  deployment. Measure generation time before adding a custom incremental renderer.
- Prepare and validate a complete export before making it current. Change the
  current export atomically. Serialize export activation so an older job cannot
  replace a newer publication or restore withdrawn content.
- Run the static file server separately from the editorial process on the same
  host. An editorial restart must not stop public file delivery. Use persistent
  storage for the active export, database, and media.
- Give the public server access only to exported content. Do not expose SQLite,
  private originals, backups, or inactive exports through its document root.
- Keep Google callbacks, sessions, review actions, and publication commands
  dynamic. Keep their responses out of shared caches.
- Do not add public upload intake to the first fixture-based implementation.
  If introduced later, submission requires a write endpoint even if public reads
  remain static. It must not write directly into the public export.

The public export is a read model. It is not a SQLite read replica. Later, we can
copy exports to other hosts without copying the editorial database. Put
Cloudflare in front of the production public origin. Orbs must also work without
Cloudflare. Do not add another origin host or a database replication service yet.

### Cloudflare rules

- Explicitly enable caching for public HTML, JSON, and React Router navigation
  data. Cloudflare does not cache HTML or JSON by default.
- Limit caching to known public routes and exported assets. Bypass editorial,
  authentication, session, preview, and write endpoints. Use `private, no-store`
  on their responses. Do not cache responses that set session cookies.
- Keep browser and edge policies consistent with each content class below.
  Cloudflare overrides must not extend the withdrawal period accidentally.
- Purge affected cached pages, navigation data, JSON, and media after correction
  or withdrawal. A successful origin update alone does not purge the edge.
- Do not enable Always Online or a service worker cache that bypasses these rules.
  Verify actual cache headers, hits, expiry, and origin-error behavior before release.

## Cache and withdrawal rule

Use these defaults for the first implementation:

- **Guidance and satellite detections:** Use five minutes of edge freshness and
  permit stale delivery for up to 24 hours after expiry if the origin fails.
  Show source and update times. This information is not a live alert service.
- **Field reports and their public copies:** Allow at most 60 seconds of cache
  freshness. Require revalidation after expiry. Do not serve stale content on
  errors. Do not give these files immutable cache headers.
- Use the stricter report policy on any page or data file that contains field
  reports or their public copies. Do not extend their lifetime by mixing them
  into a longer-lived guidance page, search index, or navigation payload.
- **Code assets:** Use long cache periods with content-based names. Do not include
  report content or private information in these assets.
- On withdrawal, remove the content from every active page, list, data export,
  and media path. Retire old public URLs. Do not leave a versioned media URL
  accessible after its publication is withdrawn.
- Report withdrawal success only after the origin stops serving the content and
  Cloudflare confirms the required purge. A failed export or purge must not
  produce a false success message. Keep the withdrawal pending until it succeeds.
- Browser copies of reports can remain fresh for up to 60 seconds after the
  origin changes. Previously downloaded copies and open pages cannot be recalled.
- Guidance and detection data have a longer outage window. A correction can reach
  cached readers later if the origin is unavailable. Do not promise a 60-second
  withdrawal deadline for this content class.
- A new public host or cache adds another withdrawal target. Do not report
  success until all controlled public origins have applied the change.

Normal export failures keep the last complete export available. They must show
the last successful update, not claim that the feed is current. Withdrawal
failures need an explicit pending state; retaining old content is not successful
withdrawal.

## Reliability limits

Static files remove the editorial process and database from public reads. They
do not remove the single host, disk, network, or static file server as failure
points. Cloudflare can serve eligible responses that remain in its cache.
Uncached, evicted, or expired responses outside the stale allowance still need
the origin. Editorial work and new Google sign-ins also need the application.
A cache is not a backup or a complete high-availability system.

Keeping last-known public content during an outage conflicts with strict
withdrawal when that content is withdrawn. Do not promise both unrestricted
stale delivery and a fixed withdrawal deadline.

## First implementation

1. Create the fresh application, version pins, migrations, and fixture data.
   Update orb setup. No Google credentials are required for normal tests.
2. Add local test sign-in and reviewer permissions. Create one fixture field
   report and public copy through an editorial form.
3. Prerender a static report page, its navigation data, and an index. Prove that
   direct visits and client navigation work when the editorial process stops.
   The public server must not read SQLite.
4. Test failed generation, concurrent publication, correction, and withdrawal.
   Check old URLs and response cache headers, not only the new page.
5. Add Google sign-in and test its validation locally. Check the live Google flow
   separately with development credentials before release.

This slice does not need a live hotspot feed, a pilot region, concession data,
or production infrastructure. Those decisions do not block fixture-based work.

## Agreement

The user accepted these cache policies on 16 October 2026. No further product
decision needs to block the first fixture-based implementation. Production
deployment still needs separate approval.

## References

- [React Router rendering strategies](https://reactrouter.com/start/framework/rendering)
- [Cloudflare default cache behavior](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/)
- [Cloudflare origin cache control](https://developers.cloudflare.com/cache/concepts/cache-control/)
