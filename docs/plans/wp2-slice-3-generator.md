---
status: accepted
date: 2026-10-18
issue: https://github.com/kawaltech/kawal.id/issues/5
scope: WP2 slice 3 only
base: 1776345391b17982b4974c0e8518fe9161d9e938
---

# Plan: WP2 slice 3, synthetic generator and fixture

This plan covers the last slice of
[WP2](reliable-satellite-release.md#wp2-export-schema-validator-and-synthetic-fixtures).
Slices 1 and 2 already provide the contract types, canonical hashing, and the
validator. Slice 3 adds the deterministic generator and the checked-in
synthetic export. It does not add a FIRMS adapter, change the public output, or
start WP3.

Status: implemented on 18 October 2026. `pnpm check` passes with 157 tests.

## 1. Goal

Produce a synthetic export that:

- reproduces the current 60 design detections one to one,
- is byte-for-byte reproducible from a seed and fixed inputs,
- scales to the D6 working capacity of 100,000 rows in under 10 seconds,
- passes the C3 validator without weakening any rule.

## 2. Inputs and fixed facts

From `app/design/detections.ts` on the base revision:

| Fact                 | Value                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------- |
| Detections           | 60                                                                                     |
| NOAA-20 rows         | 37                                                                                     |
| NOAA-21 rows         | 23                                                                                     |
| Confidence           | 15 `rendah`, 33 `nominal`, 12 `tinggi`                                                 |
| Province             | 21 Kalimantan Tengah, 13 Sumatra Selatan, 9 Riau, 7 Jambi, 7 Kalimantan Barat, 3 Papua |
| Earliest acquisition | `2026-10-13T06:25:00Z`                                                                 |
| Latest acquisition   | `2026-10-15T18:36:00Z`                                                                 |

Reproduction constants, chosen so the export matches the existing `segar` feed
and covers every detection:

| Field                    | Value                  |
| ------------------------ | ---------------------- |
| `windowEnd`              | `2026-10-16T00:20:00Z` |
| `retrievedAt`            | same as `windowEnd`    |
| `lastModified`           | `2026-10-16T00:10:00Z` |
| `createdAt`, `checkedAt` | `2026-10-16T00:30:00Z` |
| `version`                | `2.0NRT`               |
| `synthetic`              | `true`                 |

The 72-hour window is `(2026-10-13T00:20:00Z, 2026-10-16T00:20:00Z]`, so all 60
rows pass the window rule.

## 3. Files

```text
tests/support/export-generator.ts        Pure generator and design mapping
tests/fixtures/export-v1-synthetic.json  Checked-in reproduction export
tests/export-generator.test.ts           Match, determinism, capacity
```

No file under `app/export`, `apps/**`, `app/design/**`, or `scripts/**`
changes. The generator is test-only code; production code keeps using the
validator from `app/export`.

## 4. Generator API

```ts
export interface SyntheticOptions {
  seed?: number;
  rows?: number;
  windowEnd?: string;
  retrievedAt?: string;
  lastModified?: string;
  createdAt?: string;
  checkedAt?: string;
  provinces?: readonly ProvinceCode[];
}

export function reproductionExport(): ExportV1;
export function seededExport(options?: SyntheticOptions): ExportV1;
export function serializeExport(document: ExportV1): string;
```

`reproductionExport()` reads `DETECTIONS` and maps it to C2. `seededExport()`
does not read design data and is used for arbitrary sizes.

Both return a signed C3 document, using `contentHash` and `exportId` from
`app/export/hash.ts`, so the fixture is a valid export rather than an
intermediate shape.

## 5. Reproduction mapping

| C2 field                | Source                                                       |
| ----------------------- | ------------------------------------------------------------ |
| `id`                    | `detectionId({ sourceId, acquiredAt, latitude, longitude })` |
| `sourceId`              | `SOURCE_IDS[satellite]`                                      |
| `acquiredAt`            | `DETECTIONS[].acquiredAt`                                    |
| `latitude`, `longitude` | `DETECTIONS[]` unchanged                                     |
| `satellite`             | `DETECTIONS[].satellite`                                     |
| `confidence`            | `DETECTIONS[].confidence`                                    |
| `province`              | explicit map from display name to slug (section 6)           |
| `daynight`              | `D` when the WIB hour is 06:00 to 17:59, otherwise `N`       |
| `version`               | `2.0NRT`                                                     |
| `frp`, `scan`, `track`  | `null`; the design fixture has no source values              |

Counts are computed, never hard-coded:

- `accepted` = number of mapped rows (60).
- `byProvince` from the mapped rows.
- `sources[].rows` from the per-satellite row counts (37 and 23).
- `latestObservationAt` = newest `acquiredAt` (`2026-10-15T18:36:00Z`).
- `duplicate`, `outsideIndonesia`, `outsideWindow`, and every `invalid` reason
  stay zero.

## 6. Province slugs

Explicit map, not a slug function, so a renamed display label fails loudly:

| Display name      | Code                |
| ----------------- | ------------------- |
| Kalimantan Tengah | `kalimantan-tengah` |
| Sumatra Selatan   | `sumatra-selatan`   |
| Riau              | `riau`              |
| Kalimantan Barat  | `kalimantan-barat`  |
| Jambi             | `jambi`             |
| Papua             | `papua`             |

`boundary` is `synthetic-provinces` / `provisional` / `synthetic`. Its
`sha256` is the hash of the sorted code list, so adding a province changes the
boundary digest and the fixture hash.

## 7. Seeded mode

Use a small deterministic PRNG (mulberry32) seeded by `options.seed`, default
`20261017`. No `Math.random()` and no `Date.now()` inside generation.

| Field                   | Rule                                                     |
| ----------------------- | -------------------------------------------------------- |
| `acquiredAt`            | uniform minute in `(windowEnd - 72h, windowEnd]`         |
| `latitude`, `longitude` | inside Indonesia bounds: lat `[-11, 6]`, lon `[95, 141]` |
| `province`              | uniform pick from `PROVISIONAL_PROVINCES`                |
| `satellite`             | uniform pick from the two sources                        |
| `confidence`            | uniform pick from the three values                       |
| `daynight`              | derived from the WIB hour, same rule as reproduction     |
| `frp`                   | `0.5` to `50.0`, one decimal                             |
| `scan`, `track`         | `0.3` to `1.0`, three decimals                           |
| `version`               | `2.0NRT`                                                 |

Seeded coordinates and provinces are independent. This mode tests shape,
capacity, and counts, not geography. A comment in the generator must say so.

## 8. Fixture and regeneration

The fixture is `JSON.stringify(document, null, 2)` plus a trailing newline,
built in contract key order so diffs stay readable. It is roughly 20 KB.

Regenerate with:

```sh
WRITE_EXPORT_FIXTURE=1 pnpm exec vp test run tests/export-generator.test.ts
```

When the variable is absent, the test only compares. The variable never runs in
CI, so a stale fixture fails the check instead of silently updating.

Whitespace and key order in the file do not affect `contentHash`: the hash
covers canonical JSON, not file bytes.

## 9. Tests

| #   | Test                               | Expectation                                                                |
| --- | ---------------------------------- | -------------------------------------------------------------------------- |
| 1   | Reproduction row count             | 60 detections                                                              |
| 2   | One-to-one match with `DETECTIONS` | same time, coordinates, confidence, satellite, province slug for every row |
| 3   | Reproduction determinism           | two calls give the same `contentHash`                                      |
| 4   | Checked-in fixture                 | deep-equals a fresh reproduction and has the same hash                     |
| 5   | Fixture validity                   | passes `validateExport`; fails with `allowSynthetic: false`                |
| 6   | Seeded determinism                 | same seed gives the same hash                                              |
| 7   | Seed sensitivity                   | a different seed gives a different hash                                    |
| 8   | Sizes                              | 0, 1, 60, and 1,000 rows pass the validator                                |
| 9   | Capacity                           | 100,000 rows generate in under 10 seconds                                  |
| 10  | Count invariants                   | `byProvince` sums to `accepted`; source rows sum to the bucket total       |
| 11  | Window                             | every `acquiredAt` is inside `(end - 72h, end]`                            |
| 12  | Latest observation                 | equals the newest row, or `null` for zero rows                             |

Test 9 measures generation only, using `performance.now()`. If it exceeds the
budget, optimize before weakening the budget.

## 10. Risks

| Risk                                  | Mitigation                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| Design detections change              | test 4 fails; regenerate with the documented command                          |
| Seeded data is mistaken for geography | generator comment plus the plan's scope note                                  |
| 100,000 hashes are slow               | measure; use one `contentHash` call, not per-row hashing beyond `detectionId` |
| Fixture churn in review               | fixed inputs, contract key order, and a single seed                           |
| Generator leaks into production       | it lives under `tests/`; `app/export` stays unchanged                         |

## 11. Definition of done

- [x] `reproductionExport`, `seededExport`, and `serializeExport` exist.
- [x] `tests/fixtures/export-v1-synthetic.json` is checked in and validates.
- [x] The 60 rows match `DETECTIONS` one to one.
- [x] 100,000 rows generate in under 10 seconds.
- [x] Tests 1 to 12 pass.
- [x] `pnpm check` passes.
- [x] No file under `app/export`, `apps/**`, `app/design/**`, or `scripts/**`
      changes.
