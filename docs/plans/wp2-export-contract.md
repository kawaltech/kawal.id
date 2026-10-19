---
status: proposed
date: 2026-10-18
issue: https://github.com/kawaltech/kawal.id/issues/5
scope: WP2 only
base: 1776345391b17982b4974c0e8518fe9161d9e938
---

# Plan: WP2 export contract, validator, and synthetic fixtures

This plan covers WP2 of the
[reliable satellite release](reliable-satellite-release.md#wp2-export-schema-validator-and-synthetic-fixtures).
It proposes the first implementation slice that can start without credentials,
network access, or changes to the public output. It does not accept the wider
release scope, select a province dataset (D4), or approve a publication
policy (D8).

The implementation selects decisions (a), (b), and (c), recorded on
18 October 2026. They still need owner confirmation, and the wider release
scope in issue #5 remains proposed.

## 1. Definition of done

WP2 is complete when the repository has a data contract that can be validated
and hashed deterministically, shared by the synthetic generator, the future
publication run, and the future public build, without touching option B.

After WP2, WP3 only has to produce C2 records, and WP4 only has to read C3
files. Neither package has to invent a schema.

## 2. Scope

In scope:

- C1, C2, and C3 types under `app/export/`.
- Export validator, canonical serialization, and `contentHash`.
- Seeded synthetic generator that can produce 100,000 rows.
- One checked-in synthetic export that reproduces the current 60 detections.
- The acceptance tests named in WP2.

Out of scope:

- Parsing FIRMS CSV or any live source (WP3).
- Reading an export in the public loader or changing `index.server.ts` (WP4).
- Changing `app/design/ui.tsx`, `fixture.ts`, or any page.
- Selecting the official province dataset and code list (D4).
- Network access, credentials, D1, or R2.

Hard rule: `app/export` must not import `app/design/*`, and no file under
`apps/**`, `app/design/**`, or `scripts/**` changes in the WP2 pull request.

## 3. File layout

```text
app/export/types.ts        C1, C2, C3, counts, confidence, source status
app/export/canonical.ts    Canonical JSON, time and number normalization
app/export/hash.ts         SHA-256 via node:crypto, contentHash, exportId
app/export/validate.ts     checkExport, validateExport, issue paths
app/export/index.ts        Public module surface

tests/support/export-generator.ts        Seeded generator and DETECTIONS mapping
tests/fixtures/export-v1-synthetic.json  Checked-in 60-row export, synthetic
tests/export-schema.test.ts              Validation and hashing rules
tests/export-generator.test.ts           Determinism and 100,000-row timing
```

`app/export` is **Node-only**. This is deliberate: hashing uses `node:crypto`,
which is synchronous and already used under `tests/support/`. WP4 consumes the
validator during Node prerendering, so the constraint holds. Moving to Web
Crypto is a contract version change, not part of WP2.

## 4. Contract decisions

The parent plan left three points open. This implementation selects all three
on 18 October 2026 so the slice is deterministic. They remain proposals until
the owner confirms them.

### (a) Province counts are missing from the C3 schema

C3 says "Each province count must equal the sum of its rows", but the listed
`counts` fields are only `accepted`, `duplicate`, `outsideIndonesia`,
`outsideWindow`, and `invalid`.

**Selected:** `counts.byProvince: Record<string, number>`. It counts accepted
rows and includes `luar-provinsi` as a bucket, so the sum of values equals
`counts.accepted`. WP4 later reuses this map for the C5 cube.

### (b) The shape of `invalid` is unspecified

"invalid (by reason)" can mean a free-form map or a closed set.

**Selected:** use a closed set:
`badNumber`, `badTime`, `badConfidence`, `badDaynight`, `badSatellite`,
`badVersion`, `outOfRegion`. Every count is a non-negative integer. A new
reason requires a new `schemaVersion`, because it changes the hashed document.

### (c) Province identity is provisional until D4

C2 requires a code from the boundary data, but D4 is undecided. Using the
current display names would create immediate debt.

**Selected:** treat `province` as an opaque string matching
`^[a-z0-9-]+$` or exactly `luar-provinsi`. The synthetic fixture uses
provisional slugs: `kalimantan-tengah`, `sumatra-selatan`, `riau`,
`kalimantan-barat`, `jambi`, `papua`. It sets `boundary.name` to
`synthetic-provinces` and `boundary.version` to `provisional`. When D4 lands,
the code list changes without a `schemaVersion` bump, because the field type
does not change.

### (d) Missing source file times

Selected in the 19 October 2026 review response: `sourceUpdatedAt` is `null`
when at least one required source has no usable `lastModified`. A null value
requires a non-empty `approval.holds` and prevents activation. This keeps the
missing time explicit instead of deriving it from another source. D8 still
owns the freshness tolerance and release conditions.

### (e) Detection version format

The version format is `<collection>.<revision>NRT`, such as `2.0NRT`. The
collection must equal the collection pinned in `sourceId` (`c2` today).
Other revisions are allowed, so the sample `2.0NRT` is not pinned exactly. A
collection change needs explicit review, matching C1.

## 5. Validation rules

### 5.1 Document level (C3)

The validator rejects an export when:

| Condition                                                                 | Note                                     |
| ------------------------------------------------------------------------- | ---------------------------------------- |
| An unknown top-level key exists                                           | strict whitelist                         |
| A report, user, session, or review key exists                             | including nested objects                 |
| `sources` is empty or lacks a required satellite                          | both satellites required                 |
| `counts.accepted !== detections.length`                                   | consistency                              |
| `sum(counts) !== total source rows`                                       | derived from buckets                     |
| `sum(counts.byProvince) !== counts.accepted`                              | decision (a)                             |
| `windowEnd`, `createdAt`, or `checkedAt` is not UTC                       | `Z`, second precision                    |
| `sourceUpdatedAt` is not UTC or `null`                                    | decision (d)                             |
| A production source URL has credentials, no host, a query, or fragment    | C1, method A only                        |
| A source accepts more rows than it supplied                               | per-source `rows` check                  |
| `detections` is empty while any source is not `ok`                        | a zero export needs all sources `ok`     |
| `detections` is empty while any approval hold is open                     | a zero export needs no open hold         |
| A source has no `lastModified` without a null `sourceUpdatedAt` or a hold | decision (d)                             |
| `exportId !== "sat-" + contentHash`                                       | identity                                 |
| `windowHours !== 72` for version 1                                        | fixed                                    |
| `synthetic: true` in production mode                                      | `allowSynthetic` option prepared for WP4 |

### 5.2 Detection level (C2)

| Field                   | Rule                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `id`                    | 64 hex characters, equal to the hash of `[sourceId, acquiredAt, latitude, longitude]` |
| `acquiredAt`            | ISO UTC at minute precision; `windowEnd - 72h < acquiredAt <= windowEnd`              |
| `latitude`, `longitude` | finite; latitude in `[-90, 90]`, longitude in `[-180, 180]`                           |
| `satellite`             | `NOAA-20` or `NOAA-21`, matching `sourceId`                                           |
| `confidence`            | `rendah`, `nominal`, or `tinggi`                                                      |
| `daynight`              | `D` or `N`                                                                            |
| `province`              | valid slug, or `luar-provinsi`                                                        |
| `version`               | `<collection>.<revision>NRT`; collection agrees with `sourceId` (decision (e))        |
| Duplicate `id`          | rejected; conflicting fields are a WP3 concern                                        |

Row classification order, shared with WP3:
`invalid`, `outsideWindow`, `outsideIndonesia`, `duplicate`, `accepted`.

The validator compares the bucket total with the sum of `sources[].rows` (C1
data-row counts), so it detects dropped or double-counted rows. It cannot
verify the raw CSV itself; WP3 owns parsing and row validation.

### 5.3 Canonicalization and hashing

- Canonical JSON sorts keys, removes whitespace, and normalizes numbers, so
  `1.0`, `1.00`, and `-0` serialize as `1` and `0`.
- `detections` sort by `id` ascending. `sources` sort by `sourceId` ascending.
- The hash covers the full document except `exportId` and `contentHash`.
  `contentHash` strips those identity fields internally, so a complete typed
  `ExportV1` and its hashable body produce the same hash.
- `exportId` is set to `"sat-" + contentHash`; `contentHash` is written after.
- Every timestamp is part of the hash. A heartbeat produces a new ID by design.

## 6. Generator and synthetic fixture

The generator is a pure function:

```ts
generateSyntheticExport({
  seed: 20261017,
  rows: 60,
  windowEnd: "2026-10-16T00:30:00Z",
  retrievedAt: "2026-10-16T00:25:00Z",
  provinces: PROVISIONAL_PROVINCES,
}): ExportV1
```

It has two modes:

1. **Reproduction mode** reads `DETECTIONS` and maps each row to C2: time,
   coordinates, confidence, satellite, and province. `version` is `2.0NRT`.
   `daynight` is derived from the WIB hour: `D` from 06:00 to 18:00, `N`
   otherwise. This mode produces the checked-in fixture. A test asserts that
   all 60 rows match `DETECTIONS` one to one on time, coordinates, confidence,
   and satellite.
2. **Seeded mode** produces arbitrary sizes, including 100,000 rows, for
   capacity and edge-case tests. It does not read the design fixture.

Determinism rules: no `Date.now()`, no `Math.random()`, no input-order
dependence. The seed is always explicit. A window anchor is floored to a whole
UTC minute before generating, so detections always satisfy C2 precision. Each
export receives its own `boundary` and `approval` objects, including a copied
`holds` array.

Synthetic provenance uses `url: "synthetic://<sourceId>"` and `etag: null`.
The validator permits the synthetic scheme and a null ETag only when
`synthetic` is true.

## 7. Test matrix

| #   | Test                                                               | WP2 acceptance |
| --- | ------------------------------------------------------------------ | -------------- |
| 1   | A valid export passes                                              | baseline       |
| 2   | An unknown top-level key is rejected                               | required       |
| 3   | A `reports` key is rejected at top level and nested                | required       |
| 4   | Missing provenance is rejected                                     | required       |
| 5   | Mismatched `counts` are rejected                                   | required       |
| 6   | A row outside the window is rejected                               | required       |
| 7   | A duplicate `id` is rejected                                       | required       |
| 8   | A non-UTC time is rejected                                         | required       |
| 9   | An unknown confidence is rejected                                  | required       |
| 10  | Identical input produces an identical hash                         | required       |
| 11  | One changed row produces a different hash                          | required       |
| 12  | Zero detections with all sources `ok` passes                       | required       |
| 13  | Zero detections with one source `failed` fails                     | required       |
| 14  | 100,000 rows generate in under 10 seconds                          | required       |
| 15  | `exportId === "sat-" + contentHash`                                | derived        |
| 16  | Input order does not change the hash                               | determinism    |
| 17  | `1.0`, `1.00`, and `-0` produce the same key                       | normalization  |
| 18  | The window rejects the start boundary and accepts the end boundary | C3             |

## 8. Implementation slices

Slice 1: contract and hashing. `types.ts`, `canonical.ts`, `hash.ts`, plus
tests 10, 11, 15, 16, and 17.

Slice 2: validator. `validate.ts` and `index.ts`, plus tests 1 to 9, 12, 13,
and 18.

Slice 3: generator and fixture. `tests/support/export-generator.ts`,
`tests/fixtures/export-v1-synthetic.json`, test 14, and the 60-row match test.
See [the slice 3 plan](wp2-slice-3-generator.md) for the generator design.

Each slice must pass `pnpm check` on its own so it can be reviewed per commit.

Status on 18 October 2026: all three slices are implemented and `pnpm check`
passes with 157 tests. WP2 awaits review and owner confirmation.

## 9. Risks

| Risk                                      | Mitigation                                         |
| ----------------------------------------- | -------------------------------------------------- |
| D4 changes the province scheme            | opaque slug plus unchanged `schemaVersion`         |
| D8 changes validation tolerance           | closed reason set plus policy stored in `approval` |
| `node:crypto` leaks into a browser bundle | document Node-only; review imports in WP4          |
| Hashes drift because of timestamps        | tests use fixed times, never `now`                 |
| The validator is too strict for WP3       | the test matrix is the shared contract             |

## 10. Definition of done

- [x] `pnpm check` passes.
- [x] All 18 tests exist and pass.
- [x] `tests/fixtures/export-v1-synthetic.json` is checked in with
      `synthetic: true`.
- [x] No file under `apps/**`, `app/design/**`, or `scripts/**` changes.
- [x] `app/export` does not import `app/design`.
- [x] Decisions (a), (b), and (c) are recorded in this plan or in an ADR.

## 11. Decision record

This implementation selects all three on 18 October 2026. They still need
owner confirmation:

1. `counts.byProvince` is part of C3 version 1, and includes
   `luar-provinsi`.
2. The `invalid` reason set is closed; a new reason requires a schema version
   bump.
3. Province values use provisional slugs until D4 selects the official
   dataset.

The slice therefore has no implementation dependency on D4 or D8, even though
both decisions remain open.
