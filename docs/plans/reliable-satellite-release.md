---
status: proposed
date: 2026-10-17
issue: https://github.com/kawaltech/kawal.id/issues/5
base: 8dc66a8db2b80a37afec6161245abbb3814e9c18
---

# Plan: reliable satellite-data release

This plan divides step 2 of
[ADR 0007](../adr/0007-reliable-data-before-playback.md) into bounded work
packages. It is a plan for owner review. It does not give permission to
implement, integrate a live source, use credentials, create remote resources,
or deploy. The owner must accept the scope before implementation tasks start.

Planning thread:
[T-01a148f0](https://ampcode.com/threads/T-01a148f0-91cd-7304-a0b8-8c7f8bd88b7a).
The transferred proposal was checked in the medium-mode
[review thread](https://ampcode.com/threads/T-01a14900-4936-7003-8288-0f3acb7e166a).
The review used the exact transferred proposal, not a summary. The source
file had 55,152 bytes and SHA-256
`134d94431af01a8a31cd3734697cce75520384a5dee3ad1b0ebfcf2c4a4a659a`.
Coordinator:
[T-01a145d5](https://ampcode.com/threads/T-01a145d5-526c-7226-a388-20d220c2e184).

## 1. Scope and limits

The first satellite release shows satellite detections on the option B page
(`/`), with source times, validation, ordered activation, and clear fresh,
stale, and unavailable states. The table stays usable without the map.

These rules apply to every work package:

- Keep option B and its design language
  ([ADR 0003](../adr/0003-map-and-table-public-design.md)). Do not start a
  redesign. Capacity controls use the existing components and tokens.
- Keep `apps/public` static-only. A public read must not send a request to the
  app, D1, R2, or FIRMS. Prerender every page and its `_void/pages/*.json`
  ([ADR 0002](../adr/0002-static-publication.md),
  [ADR 0004](../adr/0004-void-static-deployment.md)).
- Generate public content only from an approved-public export. Never read live
  app D1 to make public content.
- Normal setup, tests, and builds use synthetic fixtures. They need no NASA,
  Earthdata, or Cloudflare credentials and send no network requests to FIRMS.
- A satellite detection is not a confirmed fire. Every count says this.

Not in this release:

- Public field reports. They stay blocked by the privacy, withdrawal,
  rollback, and recovery gates in ADR 0002. The private draft and review slice
  in [PR #1](https://github.com/kawaltech/kawal.id/pull/1)
  (`report-review-slice`, ADR 0008) is outside this plan. This
  plan does not change it and adds no path from it to the public target.
- Published health guidance. It needs expert review (decision D9).
- Playback, 3D, modeled spread, fire perimeters, cause attribution, haze or air
  quality data, and any new data service (ADR 0007).

## 2. Current state

Checked against the base revision in the header:

- [`fixture.ts`](../../app/design/fixture.ts) has 60 synthetic detections and
  three fixed feed states; the public loader returns them all as props.
  No export contract or changing freshness state exists.
- [`ui.tsx`](../../app/design/ui.tsx) shares window and confidence filters
  across map and tables. Preserve this. It draws every point and table row;
  no paging or capacity bound exists. Map geometry is Natural Earth Admin 0,
  not province boundaries.
- [`check-public-build.mjs`](../../scripts/check-public-build.mjs) checks static
  HTML/JSON pairs, loader success, backend exclusion, and B report isolation.
  It does not validate export assets or enumerate dynamic paths.
- [`check.yml`](../../.github/workflows/check.yml) serializes main preview
  deployments and verifies both hosts. It uses synthetic data, with no export
  store, scheduled publication, or data-order check.

## 3. Source assessment: NASA FIRMS

The facts below come from FIRMS pages read on 17 October 2026. The
`earthdata.nasa.gov` pages returned HTTP 403 to automated reads. Facts marked
"[unverified]" come from search summaries of those pages. Check them in a
browser before you quote them in public text.

### 3.1 Products and coverage

- **Use VIIRS 375 m NRT from NOAA-20 and NOAA-21.** The VIIRS sensor resolution
  is 375 m. Each satellite observes about twice each day. NOAA-21 is about
  50 minutes ahead of NOAA-20
  ([VIIRS description](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_VIIRS_Firehotspots.html)).
  The current fixture label already names these two satellites.
- **Do not use S-NPP.** FIRMS states: "Delivery of Suomi NPP satellite data
  products will cease on November 1, 2026"
  ([FIRMS news](https://firms.modaps.eosdis.nasa.gov/content/notifications/firms/news.html)).
  NOAA gives 2 November 2026, 13:00 UTC
  ([NESDIS notice](https://www.nesdis.noaa.gov/news/cessation-of-suomi-national-polar-orbiting-partnership-s-npp-data-users-onafter-november-2-2026)).
  The current FIRMS download-page banner also gives 2 November. The notices
  differ; do not claim one agreed NASA end date or assume a release date.
- **Do not use Landsat.** FIRMS Landsat data covers only the US and Canada
  ([WFS coverage table](https://firms.modaps.eosdis.nasa.gov/mapserver/wfs-info/)).
- **Do not mix MODIS into the first release.** MODIS has 1 km resolution and
  0–100 confidence values
  ([MODIS description](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_MODIS_Firehotspots.html)).
  Mixed resolutions make one count misleading. Decision D1 can add it later.
- **Latency.** Global NRT data arrives "within 3 hours" of the observation
  ([VIIRS description](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_VIIRS_Firehotspots.html)).
  RT and URT levels exist only for the US and Canada
  ([area API](https://firms.modaps.eosdis.nasa.gov/api/area/);
  [FAQ](https://www.earthdata.nasa.gov/data/tools/firms/faq) [unverified]).
  For Indonesia, use NRT only. Recent observations can be missing while FIRMS
  processes them. The three-hour description is not a completeness guarantee
  or proof that the most recent three hours are always incomplete.
- **Reprocessing.** FIRMS replaces NRT data with standard-processing (SP) data
  in the archive "usually after 2-3 months"
  ([active fire data](https://firms.modaps.eosdis.nasa.gov/content/active_fire/index.html)).
  The release uses NRT only. Do not merge NRT and SP records.

### 3.2 Record format and observation time

The CSV header is
`latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight`.
A sample on 17 October 2026 had `satellite` = `N21`, `confidence` = `low`, and
`version` = `2.0NRT`.

- `acq_date` and `acq_time` are UTC. `acq_time` is `HHMM`.
- Latitude and longitude are the center of a nominal 375 m pixel. Pixels are
  larger near the edge of the scan; `scan` and `track` give the actual size
  ([VIIRS description](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_VIIRS_Firehotspots.html)).
- VIIRS confidence is low, nominal, or high. The download files spell the words
  out. The API documentation uses `l`, `n`, and `h`. Normalize both.
- Satellite codes are `N20` and `N21`. Older data used `1` and `2`.
- The sampled NRT header has no record ID or type field. The VIIRS description
  confirms thermal anomalies such as volcanoes and gas flares, and restricts
  its type attribute to standard-quality data. Do not infer a fire type.
- Cloud, heavy smoke, canopy, small fires, and fires between overpasses can be
  missed. No detection does not mean no fire. The existing `Limits` text
  already says this.

### 3.3 Access methods

- **A. Keyless regional files:** official downloads link
  [NOAA-20 SE Asia 7d](https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_SouthEast_Asia_7d.csv)
  and [NOAA-21 SE Asia 7d](https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_SouthEast_Asia_7d.csv).
  The region includes neighboring countries; filter it by approved boundaries.
- **B. Area API:** needs a free `MAP_KEY`. The official
  [area API](https://firms.modaps.eosdis.nasa.gov/api/area/) supports
  `VIIRS_NOAA20_NRT` and `VIIRS_NOAA21_NRT`, date ranges of 1–5 days, and
  5,000 transactions per 10-minute interval. Large requests can count more than
  once. Its date-availability endpoint is not a per-observation completeness check.
- Do not use client WMS/WFS or remote map tiles. Keep map files local under
  ADR 0003. No fallback service integration is proposed.

**Recommendation (decision D2):** use method A for the first release. It needs
no credential and gives the full 72-hour window from one 7-day file per
satellite. Do not build method B until the owner selects it. Method A has no
verified availability endpoint or service level. `Last-Modified` is an HTTP
file time, `acquiredAt` is an observation time, and a hash is an identity, not
a time. None proves that every observation has arrived.

**Direct check in this review:** on 17 October 2026 at 08:37 UTC, a keyless
`Range: bytes=0-1800` request to each exact 7-day URL returned HTTP 206:

| Source                                       | Full size from Content-Range | Last-Modified (UTC) | Sample fields                                                 |
| -------------------------------------------- | ---------------------------- | ------------------- | ------------------------------------------------------------- |
| NOAA-20, `J1_VIIRS_C2_SouthEast_Asia_7d.csv` | 7,576,877 bytes              | 2026-10-17 07:42:31 | `N20`, `high`/`nominal`/`low`, `2.0NRT`, `2026-10-10`, `0230` |
| NOAA-21, `J2_VIIRS_C2_SouthEast_Asia_7d.csv` | 7,062,414 bytes              | 2026-10-17 07:44:54 | `N21`, `nominal`/`high`, `2.0NRT`, `2026-10-10`, `0313`       |

Both responses had the stated 13-column header, `ETag`, and `Last-Modified`.
These small samples verify access and fields, not full-file validity, the
newest observation, update frequency, or coverage completeness. No source body
was ingested or retained. The official
[region table](https://firms.modaps.eosdis.nasa.gov/active_fire/coordinates.html)
confirms 88°E–163°E, 12°S–31°N. Acquisition time is UTC per the VIIRS attribute
table; HTTP file time is not acquisition time. Earthdata FAQ still returned
403 in this review. Hourly updates and exact acknowledgement text remain
unverified release gates.

### 3.4 Attribution and disclaimer

FIRMS asks users to acknowledge "the use of data and/or imagery from NASA's
Fire Information for Resource Management System (FIRMS)", part of NASA's ESDIS.
The data is provided "as is"
([FIRMS](https://www.earthdata.nasa.gov/data/tools/firms) [unverified]). WP7
must confirm the exact text in a browser and show it on the page.

## 4. Recommended architecture

```diagram
┌────────────────────────────┐   7-day CSV files, no key
│ NASA FIRMS (NOAA-20, -21)  │──────────────┐
└────────────────────────────┘              ▼
┌──────────────────────────────────────────────────────────────┐
│ GitHub Actions publication run, serialized with deploys      │
│ 1 fetch  2 validate  3 normalize + dedupe  4 make export     │
│ order check → build → pending record → deploy → verify      │
└───────┬──────────────────────────────┬───────────────────────┘
        │ immutable export + pointer   │ checked static output
        ▼                              ▼
┌──────────────────────┐     ┌──────────────────────────────────┐
│ Export store (D3)    │     │ Public Worker: HTML, page JSON,  │
│ public data only     │     │ export data files. No app calls. │
└──────────────────────┘     └──────────────────────────────────┘
                                         ▲
                       readers ──────────┘   (app and D1 not involved)
```

- Ingestion runs as a build-time script in CI. It is not app runtime code and
  it does not use D1. Satellite data does not pass through the app.
- Each run makes a complete replacement snapshot of the available window. This
  does not claim complete satellite coverage. It does not add records to
  stored state. The export is a pure function of the snapshot and the boundary
  data and policy. Replacement snapshots simplify retries; C4 still has to
  prevent an older activation.
- A failed pre-deploy run keeps the last valid export. Failure after a deploy
  request has an uncertain outcome until reconciliation (C4). No-JS and browser
  safety follow C6.
- Every public deployment uses one concurrency group, checks out the latest
  `main`, runs the full checks, and builds with the active or a newer export.
  This applies to both code-triggered and data-triggered deployments.

Rejected alternatives:

- **App cron with D1.** A Worker cannot run the Vite build. Public generation
  would then need another export step from D1, and the app would join the
  public data path. This adds a boundary for no gain.
- **Client fetch from FIRMS.** This breaks the static-only rule and gives no
  validation or last-valid fallback.
- **ISR or runtime routes in `apps/public`.** These are not allowed.

## 5. Contracts

Each contract has a version. A change that breaks a reader needs a new version
and a migration note in the same change.

### C1. Source snapshot

One snapshot has one complete 7-day file for each required satellite.

- `sourceId`: `firms-viirs-noaa20-c2-nrt` or
  `firms-viirs-noaa21-c2-nrt`. Pin provider, instrument, satellite, collection,
  and processing level. Region and request URL are provenance, not identity.
- `url`: request URL without secrets. For direct-file (method A) access, an
  HTTPS URL with a host and no user information, query, or fragment. Redact the
  MAP_KEY path if D2 changes.
- `retrievedAt`: UTC time when the complete response finished.
- `lastModified`, `etag`: HTTP response metadata; not coverage watermarks.
  Missing, invalid, or implausibly future file times hold activation under D8.
- `sha256`, `bytes`, `rows`: full response body hash, byte count, and data-row
  count. Never treat an ETag as a content hash.
- `status`: `ok`, `invalid`, or `failed`, with a reason. Only complete,
  validated responses can be `ok`. A 206 sample is not a production snapshot.

### C2. Detection

| Field                   | Rule                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `id`                    | Full SHA-256 of the canonical tuple `[sourceId, acquiredAt, latitude, longitude]`       |
| `sourceId`              | C1 identity; must agree with the row's satellite and version                            |
| `acquiredAt`            | ISO UTC, minute precision, from `acq_date` and `acq_time`                               |
| `latitude`, `longitude` | Full source precision for identity, assignment, and aggregation; round for display only |
| `satellite`             | `NOAA-20` or `NOAA-21`                                                                  |
| `confidence`            | `rendah`, `nominal`, or `tinggi`, from `low`/`l`, `nominal`/`n`, `high`/`h`             |
| `daynight`              | `D` or `N`                                                                              |
| `province`              | Code from the boundary data (D4), or `luar-provinsi` for a point in the coastal buffer  |
| `version`               | Source `version`, `<collection>.<revision>NRT`; collection agrees with `sourceId`       |

Canonicalize dates to UTC, pad `HHMM`, map `1`/`N20` and `2`/`N21` to the
selected source, and normalize equivalent decimal coordinates (`1.0` = `1.00`,
negative zero = zero) without rounding. Use a canonical JSON tuple, not raw CSV
text. This is a local observation key, not a FIRMS record ID or a permanent
fire identity. FIRMS provides no unique pixel ID in this format. A corrected
location becomes a different key in the replacement snapshot. Store source
`frp`, `scan`, and `track`; do not show them in the first UI.

**Deduplication.** Collapse equal keys only when their normalized fields agree.
If the same key has different confidence, version, FRP, scan, track, or other
source values, hold the snapshot. Do not select the first or last row from
unordered input. Do not merge satellites, overpasses, or nearby coordinates.
Two satellites that observe one fire make two detections. Test the key's limits
with the dry-run files before release; it cannot prove physical uniqueness.

### C3. Approved-public export, version 1

One JSON document with a schema validator in shared code. The public build and
the publication run use the same validator.

```text
schemaVersion      1
exportId           "sat-" + full contentHash; identity, never an order key
synthetic          true for fixtures; production builds reject true
createdAt          UTC time the export was made
windowEnd          UTC anchor, second precision; earliest source retrievedAt
windowHours        72
checkedAt          UTC time of the run that made this export
sourceUpdatedAt    earliest Last-Modified over the required sources, or null when a source has no usable time; null requires an open hold
latestObservationAt newest acquiredAt in the export, or null
sources[]          C1 provenance for each required source, without credentials
boundary           name, version, licence, and SHA-256 of the province data
approval           { policy: "rules-v1" or a named decision, holds: [] }
counts             accepted, duplicate, outsideIndonesia, outsideWindow, invalid (by reason)
detections[]       C2 records with windowEnd − 72 h < acquiredAt ≤ windowEnd
contentHash        SHA-256 of the full canonical export except exportId/contentHash
```

- The export contains only satellite detection data and its provenance. It
  contains no report, user, session, review, or private field. The build guard
  rejects unknown top-level keys.
- `counts.accepted` must equal the number of detections. Each province count
  must equal the sum of its rows. Classify each input row exactly once: invalid,
  outsideWindow, outsideIndonesia, duplicate, or accepted, in that order.
  Their sum must equal total source rows. A conflicting duplicate holds the
  export. Sort detections by ID and sources by sourceId before hashing; keep
  all timestamps, provenance, policy, and boundary data in the hash. The same
  fixed inputs give the same ID; a heartbeat with new times gets a new ID.
- An export with zero detections is valid only when every required source is
  `ok`, file times pass freshness checks, and no hold is open. It means zero
  detections in valid available data, not no fire or complete observation.

### C4. Activation order

**One deployment writer is required.** Code and data jobs must hold the same
repository concurrency group from state read through reconciliation and final
record write, with `cancel-in-progress: false`. No dashboard rollback, separate
manual deploy, old workflow rerun, or other repository may bypass it. A pointer
compare-and-swap after deployment is not a deployment lock: the older version
could already be live when that write fails. If this single-writer rule cannot
be enforced, release is blocked; do not invent a distributed lock here.

A new data export must have a later `windowEnd` than the last confirmed export.
For **each required source**, its `lastModified` must not decrease. If the time
is equal but the body hash differs, hold for review. Comparing only the minimum
time hides regression in the other source. A source-set, collection, boundary,
or policy change needs explicit review, not automatic timestamp ordering.
No hold may be open. IDs and observation maxima do not order exports.
A code-only deployment reuses the exact confirmed export, without renewing its
times. An incompatible schema blocks the build, not a fallback to synthetic data.

Proposed sequence, within that one writer:

1. Read the store record and immutable export. Check the active Worker version
   and HTML/page JSON export IDs on **every** controlled host. Use bounded
   revalidation to account for caches. Do not choose the highest host value:
   disagreement, unknown state, or a pending attempt needs reconciliation first.
2. Check out current `main`, fetch and validate a new snapshot if needed,
   apply approval and source-order checks, then build and check all output.
   Recheck the latest-code guard before deployment. A skipped pending code job
   must not lose a code change: a data job also builds current `main`.
3. Store the complete immutable candidate and verify its hash. Before any deploy
   request, conditionally record a **pending attempt** alongside the last
   confirmed export/version. Record the candidate ID, code revision, previous
   confirmed state, and run identity. A failed write means no deployment.
4. Deploy the checked output once. Record its returned version when available.
   Check that exact `/__void/ready` version and export ID in HTML and page JSON,
   plus required data files, on all hosts. Do not infer success from CLI exit alone.
5. Only after those checks, conditionally replace the record with the new
   confirmed export/version and clear the pending attempt. A write timeout
   requires a read to determine its outcome; do not blindly repeat it.

The record can be `active.json` with confirmed and pending fields; it is CI
state, not a browser endpoint. Store selection and bootstrap remain D3/D5 gates.
For first activation, the owner must identify and verify the current synthetic
baseline; an absent record must not silently authorize a deployment.

**Recovery:** failure before step 3 leaves the active state unchanged. Any
failure, cancellation, or timeout after recording the attempt leaves it pending,
even if the deploy command fails. The next writer must resolve that attempt
before it can deploy anything. If the operation is known to have ended and all
hosts verify the candidate, complete step 5. If it is known not to have activated
and all hosts verify the prior version, clear the attempt without advancing it.
An operation still in flight, mixed versions, automatic restoration, or an
unknown outcome blocks publication and requires operator review. Do not clear
pending state merely because a host currently shows the old version. No automatic
rollback or downgrade is allowed. This chooses safety over continued publication;
the page then ages safely under C6.

Code recovery builds an older compatible code revision with the **current**
confirmed export, under the same writer and separate approval. Cloudflare's
[100-version rollback limit](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/)
does not make an older export acceptable. An out-of-band rollback is an incident,
not a normal recovery path. Reports remain subject to ADR 0002's stronger gates.

### C5. Public data files and page props

- **Page props** for `/` contain export metadata, provenance, source times, and
  counts. They do not contain all detection rows. Stamp the export ID and
  checked code revision in HTML metadata as well as page JSON for host checks.
- **Count cube.** For each **province × map grid cell**, store nine counts:
  three time bands (0–24 h, 24–48 h, 48–72 h before `windowEnd`) × three
  confidence levels. The 24, 48, and 72 h windows are nested, so the client
  makes any filter result by addition. The joint key is required: separate
  province and cell totals cannot filter a cell that crosses a province border.
  Use `(end−24h, end]`, `(end−48h, end−24h]`, and `(end−72h, end−48h]`.
  Include zero-count provinces. The empty confidence selection gives a valid
  empty result, not unavailable data.
- **Rows.** Detection rows go into static JSON files under
  `/data/<exportId>/rows/`, in bounded chunks with a manifest of paths, hashes,
  row counts, province codes, and the same nine time/confidence counts per
  chunk. Split each province into chunks of at most 200 rows; one file per
  province is not a size bound. Sort by `acquiredAt` descending, then province code, then
  `id`. Merge that order across provinces **before** pagination. Apply time,
  confidence, and province filters before the 50-row page slice. Validate file
  hashes and exportId. A failed or missing required chunk means unavailable
  rows with a retry/reload notice, never zero or a complete-looking partial table.
  Above 10,000 total rows, require a shared province selection. Within that
  province, prefix sums of chunk counts locate a filtered page without loading
  earlier pages. Load only chunks that contribute to the page: at most 50
  chunks × 200 rows. Discard old rows on page change. Even one province with
  100,000 detections must remain fully pageable. All filters affect tiles, map,
  and both tables; a page slice affects only the detection table.
- **Small maps.** A filtered result of at most 2,000 detections may use row
  coordinates only after all required chunks load. Otherwise show bounded
  aggregates. Do not load unbounded rows just to draw points.
- **Previous export.** The build also includes the row files of the previous
  export. This reduces version mismatch; it is not a guarantee for open tabs,
  multiple fast deployments, or rolled-back pages. Old tabs that miss their
  assets get an explicit reload notice, never rows from another export.
- **Map extent.** Zoom changes the view only, not the shared filtered set.
  A pilot view must state how many filtered detections lie outside its frame.
  The map count is the sum of cell weights, not the number of marks. Coarsen
  the grid until occupied marks are at most 2,000; fixed degrees alone do not
  enforce this bound. Grid levels use the same province/time/confidence keys.
- Data files use the existing page policy `public, max-age=60,
  must-revalidate`. They are not code assets.
- Dynamic page routes are allowed only with `getPrerenderPaths()`. Without it,
  Void 1.1.11 deploys a Worker for runtime rendering
  (`node_modules/void/docs/guide/ssg.md`). The build guard must enumerate these
  paths.

Working budgets, subject to D6 measurements:

- Page JSON (including manifests and cube) and HTML: 150 KB each, gzip.
- Each row chunk: at most 200 rows and 300 KB gzip.
- Table rows loaded per page: at most 10,000; DOM rows: at most 50.
- SVG detection marks, points or cells: at most 2,000.
- Total deployment files, including the previous export: fewer than 5,000.
  Cloudflare's [platform limits](https://developers.cloudflare.com/workers/platform/limits/#static-assets)
  are 20,000 files on Free, 100,000 on Paid, and 25 MiB per file.

### C6. Freshness state

The prerendered HTML cannot know the reader's current time. Thus:

- The HTML shows absolute times in WIB: last check, source update, and newest
  observation, plus the window end. It starts
  in the conservative **unavailable** presentation: dash counts, no detection
  marks, and a table notice that current freshness cannot be checked without
  JavaScript. Keep this notice outside `<noscript>` too, for script-load failure.
  Do not prerender a fresh badge or usable-looking historical counts. Absolute
  times and a threshold sentence alone do not enforce expiry without JavaScript.
- After hydration, the client computes the state in an effect, not during
  render, so hydration output stays identical. `age` is the largest of
  `now − checkedAt`, `now − sourceUpdatedAt`, and `now − windowEnd`. Recompute
  at least once a minute and on focus, visibility return, and page restore.
  A long-open page must cross both thresholds without reload. An invalid clock
  or times implausibly ahead of it gives unavailable, not fresh. This uses the
  reader's clock; a static site cannot independently verify that clock.
- A heartbeat can refresh the check time and anchor only after validating both
  files; it cannot renew their file times. Newest observation time is context,
  not a freshness clock: a quiet region can have no recent detections.

- `segar`: valid export and age at most `T_fresh`. Show filtered data and times.
- `usang`: age above `T_fresh` but at most `T_unavailable`. Keep the data and
  show the stale notice and last successful update.
- `tidak-tersedia`: invalid/missing export, unchecked/invalid clock, or age above
  `T_unavailable`. Show dashes and a notice, no counts or detection marks. The
  table says unavailable, never zero. Thresholds remain D7 decisions.

Windows always end at `windowEnd`, not at the reader's current time. A window
that ended at the current time would show zero for stale data.

## 6. Work packages

All implementation packages are unassigned. After scope acceptance, the
coordinator assigns native Amp threads under the owner's routing rules. This
does not require Claude Code. Normal checks use temporary directories and need
no credentials. Remote release checks need the separate approvals below.

### WP0. Owner decisions

- **Mode:** none (owner).
- **Depends on:** this plan.
- **Output:** answers to D1–D12 in section 8, recorded in an ADR (proposed
  number 0009) or in this plan. A decision marked "blocks" stops the named
  package until it is answered.

### WP1. Measurements before choosing frequency and capacity

- **Mode:** medium.
- **Depends on:** WP0 for D5 (approval of any credential use or deployment).
- **Boundaries:** read-only GitHub Actions history; FIRMS public pages; no
  writes.
- **Work:**
  1. Read existing `check.yml` run logs. Report p50 and p95 for checks, build,
     deploy, and post-deploy checks. Use 20 runs if available; report the actual
     sample size and do not claim a useful p95 from a few deployments.
  2. With D5 approval only: assess historical Indonesian 72-hour volumes. The
     VIIRS description starts NOAA-20 NRT in 2020, while downloads list an
     archive from April 2018; NOAA-21 starts in 2024. Do not use a claimed 2019
     two-satellite NRT peak. Confirm archive product/version and explain the
     limits of any one-satellite or SP comparison. Without approval, measure
     keyless file headers over 7 days, not a historical capacity claim.
  3. Propose the design capacity (D6) and the thresholds (D7) from the results.
- **Acceptance:** a measurement note in `docs/plans/` with raw numbers, the
  method, and source links. No code change.

### WP2. Export schema, validator, and synthetic fixtures

- **Mode:** medium.
- **Depends on:** WP0 for D4 (province code list). Work can start with the
  provinces in the current fixture.
- **Boundaries:** new shared pure code (proposed `app/export/`); `tests/`. No
  change to option B output.
- **Work:** C2 and C3 types and validator; canonical serialization and
  `contentHash`; a seeded synthetic generator under `tests/` for any size; a
  checked-in small synthetic export with `synthetic: true` that reproduces the
  current 60 detections.
- **Acceptance tests:**
  - The validator rejects: unknown top-level key, `reports` key, missing
    provenance, `counts` that do not match rows, a row outside the window, a
    duplicate `id`, a non-UTC time, an unknown confidence.
  - The same input gives the same `contentHash` in two runs. A changed row
    gives a different hash.
  - A zero-detection export with all sources `ok` passes. The same export with
    one source `failed` fails.
  - The generator makes a 100,000-row export (or the D6 value) in under
    10 seconds on an orb.

### WP3. FIRMS ingestion adapter (offline)

- **Mode:** medium.
- **Depends on:** WP2; D2 (access method), D4 (boundaries), D8 (validation
  tolerance). Blocks: D1, D2, D4, and D8.
- **Boundaries:** proposed `scripts/satellite/`; boundary data file with
  licence record; `tests/`. Normal runs read local files only. The fetch step
  runs only when an explicit flag is set and is not used in `pnpm check`.
- **Work:**
  - Parse the selected D2 format only into C2 records.
  - Validate the file: HTTP 200; exact header; satellite code matches the file;
    `version` ends in `NRT` with a known collection; size above zero and below
    a ceiling. Reject HTML or text error bodies.
  - Validate rows: finite numbers; latitude and longitude inside the request
    region; valid date and `HHMM`; `acquiredAt` not later than
    `retrievedAt + 10 min`; confidence and `daynight` in the allowed sets.
  - Assign provinces by point-in-polygon at source precision. Check foreign
    land before any coastal buffer: Malaysian land near Indonesia must not
    become `luar-provinsi`. D4 must define the distance, land mask, boundary
    ties, and overlap rule. No arbitrary buffer or province assignment.
  - Deduplicate per C2. Build the C3 export.
  - Hold rules (no activation without a person's release): the accepted count
    over the exact same overlapping observation interval falls by more than
    the D8 ratio against the confirmed export; the header or `version` changes;
    timestamps regress or equal-time hashes conflict. A snapshot above D6 or
    any asset budget blocks the build, not only one above three times D6.
- **Acceptance tests** (synthetic CSV files under `tests/`):
  - Duplicate rows inside one file and across the 48 h and 7 d files give one
    detection. These are fixture cases, not extra live fetches. Equivalent
    coordinate text and old/new satellite aliases give the same key; distinct
    satellites, minutes, and nearby points do not. Conflicting duplicates hold
    regardless of input order.
  - A late detection that appears in a later file appears in the next export.
    A detection that the source removed disappears from the next export.
  - An HTML error page, an empty body, a truncated last line, a wrong header, a
    future time, a bad confidence, and a `N20` row in a NOAA-21 file each give
    the expected result (reject the file or count the row as invalid per D8).
  - A header-only file with all sources `ok` and fresh metadata can give a valid
    zero export. Stale metadata or a large disappearance in the same overlap
    interval holds it; HTTP success alone cannot prove an empty feed is complete.
  - Points in Malaysia, Timor-Leste, and Papua New Guinea are dropped and
    counted. A point at sea near the coast goes to `luar-provinsi`.
  - All 24/48/72-hour boundaries are exclusive at the start and inclusive at
    the end. Check exact boundaries and one minute on each side.
  - The test run denies all outbound network requests.

### WP4. Public data layer and build guard

- **Mode:** medium.
- **Depends on:** WP2. Uses D6 budgets; until D6, use 100,000 rows.
- **Boundaries:** `apps/public/pages/index.server.ts`; shared aggregation code;
  `scripts/check-public-build.mjs`; `scripts/check-public.mjs`;
  `config/Caddyfile` only if `/data/` needs a rule.
- **Work:**
  - The loader reads one export file from a path set at build time. The default
    is the synthetic export. A production build mode refuses a synthetic
    export and refuses to fall back to the fixture.
  - Build the count cube and row files (C5). Write row files for the current
    and the previous export.
  - Extend the build guard: validate the export; check every expected row file
    and its `exportId`; check page props budgets; reject report keys in satellite
    exports, row files, and page JSON for `/` and `/rancangan/b`. Until WP7 removes
    the review routes, only their synthetic report fixtures are allowed. Real
    app reports are prohibited in all public output throughout. After removal,
    reject report keys in all public JSON. Enumerate any `getPrerenderPaths()`
    routes; confirm that a synthetic export keeps `noindex` and the
    synthetic-data warning.
- **Acceptance tests:**
  - For a seeded export, the cube sums equal a direct count of rows for all
    24 filter combinations (3 windows × 8 confidence sets, including empty),
    for each province and all provinces. Use unequal counts in two provinces
    within one cell, multiple cells, boundary times, and offshore points.
    Counts must match map weights and the complete filtered table, not its page.
  - At design capacity, `index.json` and the largest row file are inside the C5
    budgets. Also test all rows in one province, interleaved times, and one
    rare confidence per chunk. Every row is reachable without exceeding the
    per-page row limit. A fixed fine grid that exceeds 2,000 cells must coarsen
    without changing totals. Record manifest, cube, file count, and size budgets;
    failure blocks release rather than silently dropping rows or cells.
  - The guard fails when a row file is missing, has a different `exportId`, or
    when the page props contain all rows.
  - Synthetic reports on retained review routes pass, but report keys in a
    satellite export, row file, or `/` or `/rancangan/b` page JSON fail. After
    WP7 removes the review routes, report keys in any public JSON fail. A real
    app report in any public output fails at every stage.
  - A production-mode build with a synthetic export fails.

### WP5. Option B states, shared filters, map aggregation, and table pagination

- **Mode:** medium.
- **Depends on:** WP4. Needs owner acceptance of the visual additions (D10).
- **Boundaries:** `app/design/ui.tsx`, `app/design/kawal.css`,
  `apps/public/pages/rancangan/b.tsx`. Keep the review pages working with
  synthetic data until WP7.
- **Work:**
  - Replace the fixed feed state with C6. Keep the review bar on review pages
    only, where it can force a state for design review.
  - One filter state drives tiles, map, province table, and detection table.
    Add a province filter to this shared state (D10).
  - Map: draw points or grid cells within the C5 bound. Cell marks use
    size and a text count in `<title>`, not color alone. The legend explains a
    cell. The map `aria-label` states the total and that the table has the same
    data.
  - Detection table: 50 rows a page; stable sort per C5; "Menampilkan 51–100
    dari 4.213 deteksi"; previous and next buttons; return to page 1 when a
    filter changes; move focus to the table caption after a page change;
    announce the result count in a polite live region.
  - Province table stays complete and alphabetical, with a `luar-provinsi` row
    last. No ranking.
  - Show the source, product, satellites, observation times in WIB, the
    three-hour latency note, and the FIRMS acknowledgement.
- **Acceptance tests:**
  - Component tests: for each of the three states, tiles, map, and tables show
    the expected text; `tidak-tersedia` shows "—" and no "0" in any count.
  - Raw HTML with JavaScript disabled or blocked shows unavailable, dash counts,
    absolute times, and no detection marks at every age. No fresh claim remains.
    With JavaScript, test exact thresholds and either side, then keep a tab
    open across both thresholds and restore a suspended tab. Quiet valid data
    is distinct from unavailable. Prerendered and first hydration output agree.
  - At design capacity, the map has at most 2,000 marks and the table at most
    50 rows in the DOM.
  - Keyboard only: change every filter, move through pages, and read the
    table without the map. An axe check on `/` reports no serious or critical
    issue.
  - Screenshots of each state, at mobile and desktop widths, with points and
    with grid cells. The owner inspects them (D10).

### WP6. Ordered publication pipeline (local first)

- **Mode:** high.
- **Depends on:** WP3, WP4; D3 (export store), D5 (approvals), D11 (schedule).
  Blocks: D3 for the store adapter. The local simulation can start without D3.
- **Boundaries:** new workflow file; `scripts/satellite/`; `check.yml` changes
  to read the active export; no remote write until D5 approval.
- **Work:**
  - A workflow with `schedule` and `workflow_dispatch` in the same concurrency
    group as the **job** that deploys main, `cancel-in-progress: false`. Hold
    that group for the full C4 sequence; do not lock only the upload step.
  - Follow C4: reconcile; checkout current `main`; checks; fetch; validate;
    order check; build; guard; persist candidate and pending attempt; deploy;
    verify all hosts; confirm record. Record timings and failure state.
  - Deploy rule: deploy when checked code changed, a source `sha256` changed,
    or the confirmed export's `checkedAt` is older than the heartbeat (D11).
    Otherwise exit without a deployment. Code-only deployments keep that time
    and cannot postpone the heartbeat. A code change must not depend on a
    source change.
  - A failed fetch, validation, build, or check does not deploy and does not
    move the pointer. The run fails visibly. The page then becomes stale by C6.
  - A repository variable pauses publication. A paused run exits before the
    fetch.
  - A held export needs an authorized person's explicit D8 release tied to
    the exact export hash and reasons. A dispatch input is not authorization.
    Recheck freshness, order, and budgets; approval cannot bypass them.
  - Change `check.yml`: once production mode is on, a code deployment reads the
    active export from the store and fails if it cannot. It never deploys the
    synthetic fixture over real data.
- **Facts to design for:**
  - GitHub's default queue keeps one running and one pending run. A new run
    replaces the pending one. Current docs also offer `queue: max`, but this
    plan does not require it. Dispatch order is not a data-order guarantee
    ([concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)).
    Every run must therefore be a complete, safe deployment.
  - Scheduled runs can be late or dropped under load, especially at the start
    of the hour. Public repositories disable them after 60 days without
    activity
    ([schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)).
    Use a minute offset. Alert on a missed heartbeat.
  - R2's [S3 API](https://developers.cloudflare.com/r2/api/s3/api/) documents
    atomic `PutObject` conditions (`If-Match`, `If-None-Match`). This is relevant
    to CI, unlike a Workers-binding-only example. Prove successful and failed
    conditions, timeout recovery, and read-after-write through the selected CI
    client in an approved test store. No app Worker or D1 is needed.
- **Acceptance tests** (local, fake deployer and fake store in a temporary
  directory, no network):
  - Two jobs contend: the second cannot deploy while the first holds the group.
    Reverse dispatch/data order; the later-running older candidate is rejected
    **before** deployment. Replace a pending code job with a data job and prove
    that current code is still built. An old workflow rerun cannot bypass C4.
  - Use source times `(10:00, 12:00)` then `(11:00, 11:30)`: reject the second
    even though its minimum increases. Equal times with changed bytes hold.
  - A code-only deployment keeps the exact export and its freshness times.
    With unchanged sources and frequent code-only deployments, the original
    heartbeat deadline still applies. A heartbeat validates the sources again;
    it does not renew their file times.
  - Failed fetch, validation, or build leaves the confirmed state and live
    version unchanged. A failed pending write prevents any deploy request.
  - Interrupt after pending write, during deploy, after activation, after one
    host check, and during confirmation write. Restart with persistent state:
    it must reconcile before a new deploy. A timed-out request may finish later;
    an old host response is not proof that it failed. Report actual host state.
  - If activation succeeded but checks or confirmation failed, preserve pending
    state, block lower exports and code-only fallback, then confirm only after
    every host verifies the candidate. Mixed versions remain blocked.
  - A conditional-write conflict stops the run, not an overwrite. A rollback
    or unknown host export is an incident. Do not choose the highest response.
  - A paused run and a held export do not deploy.
  - Unchanged sources, unchanged code, and no due heartbeat: no deployment.
    A heartbeat with stale source times does not make the feed fresh.

### WP7. Release evidence and activation

- **Mode:** high.
- **Depends on:** WP1–WP6; D3, D5, D9, D12, and a separate owner approval for
  the release deployment.
- **Work and acceptance checks:**
  1. **Dry run.** With D5 approval, run the pipeline on a schedule for at
     least 7 days to a non-production target or in build-only mode. Record
     each run: fetch time, source `Last-Modified`, row counts, invalid and
     dropped counts, holds, and step timings.
  2. **Publication frequency.** Choose the schedule and heartbeat (D11) from
     the measured p95 run time, schedule delay, and source update times.
     Record the expected deployments per day and the resulting rollback window
     (100 versions).
  3. **Cache and failure behavior.** On both public hosts, after an approved
     deployment: record `Cache-Control`, `Age`, and `CF-Cache-Status` for
     HTML, page JSON, and row files; record the time until each host serves the
     new `exportId` (p50, p95); repeat after 60 seconds. Simulate a failed run
     and show that the page keeps the last export and becomes stale on the
     reader's clock. Do not promise edge stale-on-error.
  4. **Worker quota.** Count Worker invocations for one page view, including
     row files and code assets. Compare with the account plan. The Free plan
     limit is 100,000 requests each day
     ([limits](https://developers.cloudflare.com/workers/platform/limits/#daily-requests)).
     The owner decides the plan before release (D12).
  5. **App stopped.** Locally: stop `dev` and `app`, confirm the app port is
     closed, and run `node scripts/check-public.mjs` against Caddy with a
     design-capacity export. On the public hosts: a browser network log of
     direct visits, `Link` navigation, filter changes, and pagination shows
     requests only to the public host. No request goes to `app.kawal.id`,
     FIRMS, or any other origin.
  6. **Release content.** Remove `/rancangan` routes, the review bar, and the
     synthetic-data footer. Decide `noindex` (D12). Remove unreviewed guidance
     text or publish reviewed guidance (D9). Confirm the FIRMS acknowledgement
     text.
  7. **Evidence record.** Write one release record with the export ID, Worker
     version, both host checks, cache numbers, quota numbers, screenshots of
     each state, and the dry-run summary.

## 7. Dependencies

```diagram
┌─────────┐
│ WP0     │ owner decisions D1–D12
└──┬──────┘
   ├──────────────► WP1 measurements ───────────────┐
   ▼                                                │
┌─────────┐    ┌──────────────┐                     │
│ WP2     │───►│ WP3 ingestion│──┐                  │
│ schema  │    └──────────────┘  │   ┌───────────┐  │
│         │    ┌──────────────┐  ├──►│ WP6       │  │
│         │───►│ WP4 data +   │──┘   │ pipeline  │  │
└─────────┘    │ build guard  │      └─────┬─────┘  │
               └──────┬───────┘            │        │
                      ▼                    ▼        ▼
               ┌──────────────┐      ┌──────────────────┐
               │ WP5 option B │─────►│ WP7 release      │
               │ UI           │      │ evidence         │
               └──────────────┘      └──────────────────┘
```

- WP2 can start after the owner accepts the scope.
- WP3 and WP4 can run in parallel after WP2. WP3 must not start before D2 and
  D4.
- WP5 needs WP4. WP6 needs WP3 and WP4.
- WP1 step 1 can run at any time. WP1 step 2 and WP7 need D5 approvals.
- WP4, WP5, and WP6 edit different files. WP5 owns `app/design/ui.tsx`. WP4
  owns the build scripts. WP6 owns the workflow files. Coordinate any change
  to `check.yml` between WP4 and WP6.
- The private review slice (PR #1, issue #2) and D1 recovery (issue #3) do not
  block this release. This release does not unblock public reports.

## 8. Owner decisions

No source, schedule, store, or approval policy is approved yet. Each item gives a
recommendation only.

- **D1 — Products (blocks WP3):** recommend NOAA-20/21 VIIRS C2 NRT only.
  Exclude S-NPP, MODIS, and Landsat from this release.
- **D2 — Access (blocks WP3/WP6):** recommend keyless regional 7-day files.
  If the owner selects the area API, use an Actions secret available only to
  the fetch step. Do not implement both adapters in advance.
- **D3 — Store and writer (blocks remote WP6/WP7):** proposed separate R2
  bucket for public exports and the confirmed/pending record; no browser
  access or app binding. Decide retention, CI client, access, writer
  restrictions, and bootstrap. Actions artifacts are for build-only evidence,
  not the durable activation record. No store is selected.
- **D4 — Boundaries (blocks WP2 codes/WP3):** select a licensed province
  dataset, code list, and foreign-land mask. Define boundary ties and any
  coastal distance/overlap rules. Prefer no offshore buffer until settled.
  No boundary dataset is selected.
- **D5 — Remote approvals (blocks WP1 history/WP6 remote/WP7):** separate
  approval for credential use, SP history access, store/token creation,
  dry-run deployment, and release deployment. None is granted by this plan.
- **D6 — Capacity (blocks final WP4 budgets):** 100,000 detections in 72 h is
  an unmeasured working value. Select headroom after WP1. Prove C5 with all
  rows in one province and dispersed cells before accepting the budgets.
- **D7 — Freshness (blocks final WP5 states/text):** recommend unavailable
  HTML until browser checks age. Confirm that tradeoff. Select thresholds
  from file ages, run time, schedule delay, and heartbeat. Four and 72 hours
  remain examples, not accepted values or guarantees.
- **D8 — Approval (blocks WP2 policy/WP3 holds/WP6):** rules-v1 is a proposal.
  Decide strict row validation, clock/freshness limits, overlap-drop ratio,
  authorized hold reviewers, and exact-hash release evidence. Dispatch cannot
  waive invalid schema, older sources, or exceeded budgets.
- **D9 — Guidance (blocks WP7):** remove placeholder advice or obtain expert
  review before publication. Keep links to official sources.
- **D10 — Capacity controls (blocks WP5):** preserve B's components and tokens.
  Review province selection, grid cells, paging, and conservative HTML states.
  New visual design must use the agreed Claude Code Opus 5.5 route; this review
  does not approve a redesign or bypass that rule.
- **D11 — Schedule (blocks production WP6):** choose after measurement and dry
  run. Thirty-minute checks and a three-hour heartbeat are starting proposals
  only. Select an alert recipient and existing notification channel.
- **D12 — Release (blocks WP7):** decide controlled hosts, Worker quota/plan,
  and `noindex` removal. Keep synthetic warnings and `noindex` until release.

Questions that do not block the first release:

- Show static heat sources (volcanoes, gas flares) differently? NRT data has no
  type field. A later mask needs its own decision and source.
- Offer a public CSV download of the export? This needs the FIRMS attribution
  in the file and a size budget.
- Show neighboring countries on the map without counts? Haze crosses borders,
  but the table is for Indonesian provinces.

## 9. Test plan against issue #5

| Issue #5 check                                | Covered by                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Duplicate observations                        | WP3: duplicates in one file and across overlapping files                                                      |
| Late observations                             | WP3: late detection appears in the next export; removed detection disappears                                  |
| Invalid observations                          | WP2 validator; WP3 file and row cases                                                                         |
| Overlapping runs                              | WP6: shared critical section, reversed data order, replaced pending job, old workflow rerun                   |
| Failed generation                             | WP6: pre-deploy failure retains active export; pending attempts block new writes until reconciliation         |
| Older activation                              | WP6: later windowEnd plus non-regression for each source; no rollback exception                               |
| Stale and unavailable data                    | WP5: no-JS/blocked-JS safety, long-open and resumed tabs, threshold boundaries, no unavailable zero           |
| Shared map/table results at expected capacity | WP4: 24 filter combinations, joint province/cell totals, concentrated volume, complete paging; WP5 DOM limits |
| Field reports separate                        | Section 1; WP2/WP4 guard rejects report keys; no PR #1 path to public                                         |
| Explicit export approval and schedule choices | Section 8, D8 and D11                                                                                         |

## 10. Risks

- **S-NPP end.** The release must not depend on S-NPP. NOAA-20 or NOAA-21
  outages reduce detections. The export records each source, and a failed
  required source stops activation.
- **Keyless files change without notice.** The header check and hold rules
  stop activation. The adapter can switch to the area API after D2.
- **Scheduled runs are late or dropped.** The heartbeat alert and the client
  stale state make this visible to operators and readers. Static HTML remains
  unavailable without a working freshness check. Choose an alert recipient and
  existing notification channel under D11; no new monitoring service is selected.
- **Worker quota in a fire season.** Each page view can use several Worker
  requests. WP7 measures this before release.
- **Rollback window.** Many deployments push older versions past the
  100-version rollback limit. Recover code by a new deployment from Git.
- **Unofficial comparison.** Readers can compare counts with official hotspot
  pages that use other products or filters. The page states the product,
  satellites, confidence filter, and window.

## 11. Sources

- NASA FIRMS: [API index](https://firms.modaps.eosdis.nasa.gov/api/),
  [area API](https://firms.modaps.eosdis.nasa.gov/api/area/),
  [MAP_KEY limits](https://firms.modaps.eosdis.nasa.gov/api/map_key/),
  [data availability](https://firms.modaps.eosdis.nasa.gov/api/data_availability/),
  [API guide](https://firms.modaps.eosdis.nasa.gov/content/academy/data_api/firms_api_use.html),
  [VIIRS description](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_VIIRS_Firehotspots.html),
  [MODIS description](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_MODIS_Firehotspots.html),
  [active fire downloads](https://firms.modaps.eosdis.nasa.gov/active_fire/),
  [regional coordinates](https://firms.modaps.eosdis.nasa.gov/active_fire/coordinates.html),
  [active fire data notes](https://firms.modaps.eosdis.nasa.gov/content/active_fire/index.html),
  [news](https://firms.modaps.eosdis.nasa.gov/content/notifications/firms/news.html),
  [WMS](https://firms.modaps.eosdis.nasa.gov/mapserver/wms-info/),
  [WFS](https://firms.modaps.eosdis.nasa.gov/mapserver/wfs-info/).
- NASA Earthdata (HTTP 403 to automated reads; check in a browser):
  [FIRMS](https://www.earthdata.nasa.gov/data/tools/firms),
  [FAQ](https://www.earthdata.nasa.gov/data/tools/firms/faq),
  [S-NPP delivery end](https://www.earthdata.nasa.gov/data/alerts-outages/suomi-npp-data-product-delivery-cease-november-1-2026).
- NOAA:
  [S-NPP data cessation](https://www.nesdis.noaa.gov/news/cessation-of-suomi-national-polar-orbiting-partnership-s-npp-data-users-onafter-november-2-2026).
- Cloudflare:
  [Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
  [rollbacks](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/),
  [static asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/),
  [R2 S3 conditional operations](https://developers.cloudflare.com/r2/api/s3/api/).
- GitHub Actions:
  [schedule event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule),
  [concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).
- Void 1.1.11: `node_modules/void/docs/guide/ssg.md` (static output and
  `getPrerenderPaths()`).
- Project: [ADR 0002](../adr/0002-static-publication.md),
  [ADR 0003](../adr/0003-map-and-table-public-design.md),
  [ADR 0004](../adr/0004-void-static-deployment.md),
  [ADR 0007](../adr/0007-reliable-data-before-playback.md),
  [operations](../operations.md), issue
  [#5](https://github.com/kawaltech/kawal.id/issues/5).

## 12. Review corrections and remaining limits

This review checked the issue, ADRs 0002/0003/0004/0007, the current workflow,
option B's shared filters, the build guard, and the pinned Void SSG guide.
It changed only this proposal. The architecture is still a recommendation.

| Correction                                                               | Reason                                                                                                                                                                                       |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single writer, durable pending attempt, reconcile before another deploy  | Post-deploy pointer CAS cannot prevent stale activation; host checks and a store write are not one transaction. Unknown deploy outcomes must block, not silently revert to an older pointer. |
| Removed the satellite rollback exception                                 | ADRs 0002/0004 require older-export rejection. Correct timestamps do not make a downgrade acceptable.                                                                                        |
| Compare each source; IDs are not order keys                              | A higher minimum file time can hide one source's regression. Retrieval time and the newest detection do not prove source completeness.                                                       |
| Canonical source-aware observation keys and full export hashes           | CSV formatting and legacy aliases must not create duplicates. Conflicting same-key rows need a hold. Truncated IDs and metadata-free hashes do not identify a complete immutable export.     |
| Joint province/cell counts; bounded row chunks; filter before page slice | Separate totals fail at province borders. One file per province and fixed-size geographic grids do not bound worst-case assets or DOM size.                                                  |
| Unavailable no-JS HTML; repeated browser age checks                      | A static fresh badge can survive a stopped pipeline. A threshold sentence does not hide expired counts.                                                                                      |
| Narrow source claims and measurements                                    | Small keyless samples verify format/access only. S-NPP notices differ; NOAA-21 did not cover 2019/2023; SP history is not a measured two-satellite NRT capacity.                             |

No end-to-end ingestion, concurrency, recovery, cache, capacity, browser, or
deployment check was executed for this proposal. Those are acceptance gates,
not completed evidence. No credentials were requested or exposed. No resource,
app/D1 path, report change, or remote write was added. Completion of planning
does not accept the implementation scope. The coordinator must update issue
ownership separately if authorized; this review did not edit GitHub. Store/writer
enforcement, boundary data, rules-based approval, source freshness, schedule,
capacity, no-JS policy, and release settings remain open.
