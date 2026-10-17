---
date: 2026-10-17
issue: https://github.com/kawaltech/kawal.id/issues/5
measurement_base: 1776345391b17982b4974c0e8518fe9161d9e938
scope: WP1 step 1 only
---

# CI timing baseline

The latest 20 workflow runs contain four different check sets. The current
set uses native Vite+ checks and passes 107 tests. Its three observed
`pnpm check` times are 40, 58, and 60 seconds: a median of 58 seconds.
Three samples cannot establish a useful p95.

Across all 20 runs, the mixed sample has a check median of 53.5 seconds and
a sample p95 of 63 seconds. The final build log interval has a median of
5.109 seconds and a sample p95 of 5.514 seconds. These pooled values do not
describe one fixed check set.

Three deployments succeeded. Their durations were 23, 26, and 27 seconds.
The median was 26 seconds. Checks on both public hosts took 4, 5, and
5 seconds. Neither three-value sample establishes a useful p95.

This note records WP1, step 1 of the
[satellite-release proposal](reliable-satellite-release.md#wp1-measurements-before-choosing-frequency-and-capacity).
The maintainer agreed to this measurement task. The wider proposal remains
proposed. This note selects no source, capacity, freshness limit, or schedule.
All real-data release gates remain in force.

## Sample and sources

The run list was read on 17 October 2026 at 17:54 UTC. The sample contains
the latest 20 runs of `.github/workflows/check.yml` available at that time:
runs 32 through 51. There were 51 runs in the repository. All 20 sampled
runs were complete.

- There are 12 push runs and 8 pull-request runs, from 13 source revisions.
- All runs use attempt 1. There are no workflow reruns or cancelled runs in
  this sample.
- All 20 runs succeeded. All setup, `pnpm check`, and local D1/R2/static-read
  steps succeeded.
- Deployment and post-deployment checks each succeeded three times and were
  skipped 17 times. No failed deployment occurs in this sample.
- Both job metadata and logs were available for every sampled run.

The source records are the
[Actions run list](https://api.github.com/repos/kawaltech/kawal.id/actions/runs?per_page=20),
each run's attempt-1 job metadata, and its `application` job log.
The run list changes over time; the tables below fix the sampled run IDs.
For a run ID `R`, the metadata endpoint is
`GET /repos/kawaltech/kawal.id/actions/runs/R/attempts/1/jobs?per_page=100`.
For a job ID `J`, the log endpoint is
`GET /repos/kawaltech/kawal.id/actions/jobs/J/logs`.
The linked job pages give the same step records and logs.

The baseline checkout was
[1776345](https://github.com/kawaltech/kawal.id/commit/1776345391b17982b4974c0e8518fe9161d9e938).
Its [workflow](https://github.com/kawaltech/kawal.id/blob/1776345391b17982b4974c0e8518fe9161d9e938/.github/workflows/check.yml)
defines the named stages. Each run link below retains its own workflow and logs.

## Method


1. Read the latest 20 repository runs. Confirm that each run uses
   `.github/workflows/check.yml`. Include all branches and both event types.
   Do not replace a failed run with an older successful run.
2. Read each run's attempt-1 `application` job and log. Check
   `run_attempt` before assuming there is only one attempt.
3. For each named step, subtract `started_at` from `completed_at`.
   These API times have one-second resolution. A skipped step has no measured
   duration, even when its two timestamps are equal.
4. For the final build, remove ANSI color codes from the log. Find the
   `Run pnpm check` step. Within that step, start at the timestamp of
   `> kawal.id@ build`. End at the last `✓ built in` line before the next
   workflow step. Require one root build banner and four build-completion
   lines in that interval. All 20 logs meet this check.
5. Read the checked revision from the line after
   `git log -1 --format=%H` in the checkout log. For a pull-request run,
   this is the tested merge revision. The run API's `head_sha` is the
   source revision. Record both; do not label the source head as tested code.
6. Calculate each summary from successful measurements of that stage.
   A successful check in a run that later fails deployment remains a
   successful check sample. Keep failed and skipped stages separate.
7. Sort each duration list. The p50 is the median: average the two middle
   values for an even sample. The sample p95 is the value at
   `ceil(0.95 × n)`, counted from 1. Do not interpolate. Calculate from
   the values before display rounding.

Build timestamps are read to millisecond precision. The build interval is
a log measurement, not an exact process duration. It includes the final
public build, public build guard, and app build. It excludes command startup
before the root banner and quiet cleanup after the final build line.

The build interval is **inside** `pnpm check`; do not add them together.
The setup step also builds both targets. Worker builds inside the tests are
part of the check time. The table does not separate those test builds.

## Check sets

The log identifies the compiler command and the number of tests that passed.
These define groups A through D below. Native checks use
`vp check --no-fmt --no-lint`; the older compiler command is `tsc`.

[PR #13](https://github.com/kawaltech/kawal.id/pull/13) added native Vite+ compiler checks and
type-aware lint rules. [PR #11](https://github.com/kawaltech/kawal.id/pull/11) added recovery tests.
Both changes are in current main. Group D has both changes.

| Group | Compiler | Tests passed | Runs | Samples | Check median (s) | Check range (s) |
| --- | --- | ---: | --- | ---: | ---: | --- |
| A | `tsc` | 101 | 32–43 | 12 | 51.5 | 45–67 |
| B | `tsc` | 107 | 44–45 | 2 | 56 | 55–57 |
| C | Native Vite+ | 101 | 46–48 | 3 | 54 | 53–54 |
| D | Native Vite+ | 107 | 49–51 | 3 | 58 | 40–60 |

Group D contains one branch push, one PR run, and one main push. Its branch
and PR runs share a source head. These are not three independent releases.
The groups are too small and differ in code and runner conditions. Do not
use their medians to claim that one compiler or test set is faster.

## Successful-stage summary

All values are seconds. “Sample p95” describes the mixed 20-run sample only.
It is not an estimate for the current check set.

| Stage | Successful samples | p50 | Sample p95 | Minimum | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| Setup, including its builds | 20 | 19 | 22 | 15 | 24 |
| `pnpm check`, including final builds | 20 | 53.5 | 63 | 40 | 67 |
| Final build log interval inside the check | 20 | 5.109 | 5.514 | 3.209 | 5.580 |
| Local D1/R2 and static reads | 20 | 9 | 10 | 6 | 11 |
| Deployment | 3 | 26 | Insufficient sample | 23 | 27 |
| Post-deployment checks on both hosts | 3 | 5 | Insufficient sample | 4 | 5 |

The deployment command uses `--skip-build`, so its duration does not include
another build. None of these values is a release target.

## Per-run measurements

The links in the first column open each `application` job. Durations are
seconds. All measured stages and complete jobs below succeeded. “Skip” means
the step did not run; it is not a zero-second success.

“Build” is the final build log interval defined above. “Local” is the
D1/R2 and static-read step. “Post” checks the deployed version and public files
on both hosts. “Total” is the full application job, from its API start to end;
it includes setup and cleanup but excludes waiting before the job starts.

| Job | Group | Setup | Check | Build | Local | Deploy | Post | Total |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| [51](https://github.com/kawaltech/kawal.id/actions/runs/39052405792/job/117453467144) | D | 20 | 60 | 5.514 | 11 | 26 | 5 | 137 |
| [50](https://github.com/kawaltech/kawal.id/actions/runs/39052254040/job/117453034566) | D | 20 | 58 | 5.348 | 10 | Skip | Skip | 102 |
| [49](https://github.com/kawaltech/kawal.id/actions/runs/39052251919/job/117453028501) | D | 15 | 40 | 3.209 | 6 | Skip | Skip | 76 |
| [48](https://github.com/kawaltech/kawal.id/actions/runs/39052094799/job/117452578027) | C | 19 | 54 | 5.385 | 10 | 23 | 4 | 129 |
| [47](https://github.com/kawaltech/kawal.id/actions/runs/39051839401/job/117451848612) | C | 20 | 54 | 5.440 | 10 | Skip | Skip | 97 |
| [46](https://github.com/kawaltech/kawal.id/actions/runs/39051819040/job/117451795252) | C | 19 | 53 | 5.415 | 10 | Skip | Skip | 96 |
| [45](https://github.com/kawaltech/kawal.id/actions/runs/39051163938/job/117449863240) | B | 24 | 57 | 5.580 | 9 | Skip | Skip | 109 |
| [44](https://github.com/kawaltech/kawal.id/actions/runs/39051158025/job/117449846587) | B | 19 | 55 | 5.351 | 9 | Skip | Skip | 97 |
| [43](https://github.com/kawaltech/kawal.id/actions/runs/39049117910/job/117443904261) | A | 17 | 46 | 4.256 | 8 | Skip | Skip | 89 |
| [42](https://github.com/kawaltech/kawal.id/actions/runs/39048971719/job/117443370599) | A | 17 | 49 | 4.197 | 9 | Skip | Skip | 91 |
| [41](https://github.com/kawaltech/kawal.id/actions/runs/39048967725/job/117443359494) | A | 19 | 45 | 4.153 | 8 | Skip | Skip | 87 |
| [40](https://github.com/kawaltech/kawal.id/actions/runs/39048748821/job/117442716465) | A | 19 | 48 | 4.150 | 8 | Skip | Skip | 94 |
| [39](https://github.com/kawaltech/kawal.id/actions/runs/39048575886/job/117442216304) | A | 19 | 52 | 5.339 | 9 | Skip | Skip | 94 |
| [38](https://github.com/kawaltech/kawal.id/actions/runs/39048573076/job/117442208078) | A | 17 | 45 | 4.106 | 9 | Skip | Skip | 87 |
| [37](https://github.com/kawaltech/kawal.id/actions/runs/39048252208/job/117441258703) | A | 19 | 51 | 5.390 | 10 | Skip | Skip | 93 |
| [36](https://github.com/kawaltech/kawal.id/actions/runs/39048248101/job/117441246265) | A | 19 | 53 | 5.300 | 9 | Skip | Skip | 95 |
| [35](https://github.com/kawaltech/kawal.id/actions/runs/39048011842/job/117440556848) | A | 21 | 63 | 4.850 | 9 | Skip | Skip | 119 |
| [34](https://github.com/kawaltech/kawal.id/actions/runs/39048005571/job/117440540225) | A | 21 | 67 | 4.918 | 10 | Skip | Skip | 123 |
| [33](https://github.com/kawaltech/kawal.id/actions/runs/39047429801/job/117438884185) | A | 22 | 63 | 4.912 | 9 | 27 | 5 | 145 |
| [32](https://github.com/kawaltech/kawal.id/actions/runs/39047277218/job/117438428972) | A | 22 | 57 | 4.415 | 8 | Skip | Skip | 104 |

## Exact run revisions

All creation times below are UTC on 17 October 2026. Each revision link
contains the full 40-character commit ID. “PR” means `pull_request`.
Every row is attempt 1.

| Run | Created (UTC) | Event | API source head | Checked revision from log |
| --- | --- | --- | --- | --- |
| [51](https://github.com/kawaltech/kawal.id/actions/runs/39052405792/attempts/1) | 17:07:55 | push | [1776345](https://github.com/kawaltech/kawal.id/commit/1776345391b17982b4974c0e8518fe9161d9e938) | [1776345](https://github.com/kawaltech/kawal.id/commit/1776345391b17982b4974c0e8518fe9161d9e938) |
| [50](https://github.com/kawaltech/kawal.id/actions/runs/39052254040/attempts/1) | 17:05:51 | PR | [3134d0a](https://github.com/kawaltech/kawal.id/commit/3134d0a52c775fb54f095580a84b041408b3d71e) | [6b99d40](https://github.com/kawaltech/kawal.id/commit/6b99d4036126ffe7a7cf4b70f576d9ed4d3b388a) |
| [49](https://github.com/kawaltech/kawal.id/actions/runs/39052251919/attempts/1) | 17:05:49 | push | [3134d0a](https://github.com/kawaltech/kawal.id/commit/3134d0a52c775fb54f095580a84b041408b3d71e) | [3134d0a](https://github.com/kawaltech/kawal.id/commit/3134d0a52c775fb54f095580a84b041408b3d71e) |
| [48](https://github.com/kawaltech/kawal.id/actions/runs/39052094799/attempts/1) | 17:03:38 | push | [e88df61](https://github.com/kawaltech/kawal.id/commit/e88df61a2257dfd40cea86b03ba1db3b9a4dab26) | [e88df61](https://github.com/kawaltech/kawal.id/commit/e88df61a2257dfd40cea86b03ba1db3b9a4dab26) |
| [47](https://github.com/kawaltech/kawal.id/actions/runs/39051839401/attempts/1) | 17:00:14 | PR | [ad108a8](https://github.com/kawaltech/kawal.id/commit/ad108a8429a2cc2265ad2d0710bcdcef6dfd1381) | [3a52056](https://github.com/kawaltech/kawal.id/commit/3a5205621300d25e57ecd6ed559964e0a32dbac7) |
| [46](https://github.com/kawaltech/kawal.id/actions/runs/39051819040/attempts/1) | 17:00:01 | push | [ad108a8](https://github.com/kawaltech/kawal.id/commit/ad108a8429a2cc2265ad2d0710bcdcef6dfd1381) | [ad108a8](https://github.com/kawaltech/kawal.id/commit/ad108a8429a2cc2265ad2d0710bcdcef6dfd1381) |
| [45](https://github.com/kawaltech/kawal.id/actions/runs/39051163938/attempts/1) | 16:50:32 | PR | [b217e96](https://github.com/kawaltech/kawal.id/commit/b217e9612ee01460c05402b27695d4d7b8aa7aa4) | [8415bde](https://github.com/kawaltech/kawal.id/commit/8415bde00d5ebb850570b85f9aed1c37947efd37) |
| [44](https://github.com/kawaltech/kawal.id/actions/runs/39051158025/attempts/1) | 16:50:27 | push | [b217e96](https://github.com/kawaltech/kawal.id/commit/b217e9612ee01460c05402b27695d4d7b8aa7aa4) | [b217e96](https://github.com/kawaltech/kawal.id/commit/b217e9612ee01460c05402b27695d4d7b8aa7aa4) |
| [43](https://github.com/kawaltech/kawal.id/actions/runs/39049117910/attempts/1) | 16:22:25 | push | [153bdce](https://github.com/kawaltech/kawal.id/commit/153bdcee30a5c5d22d8722a57299da2bd99518e5) | [153bdce](https://github.com/kawaltech/kawal.id/commit/153bdcee30a5c5d22d8722a57299da2bd99518e5) |
| [42](https://github.com/kawaltech/kawal.id/actions/runs/39048971719/attempts/1) | 16:20:23 | PR | [4d9a1a0](https://github.com/kawaltech/kawal.id/commit/4d9a1a045dcfd000c8d9af32f06473eea936dce9) | [69f4712](https://github.com/kawaltech/kawal.id/commit/69f47129c344fcd775eb49c5cb63cf821abf6559) |
| [41](https://github.com/kawaltech/kawal.id/actions/runs/39048967725/attempts/1) | 16:20:20 | push | [4d9a1a0](https://github.com/kawaltech/kawal.id/commit/4d9a1a045dcfd000c8d9af32f06473eea936dce9) | [4d9a1a0](https://github.com/kawaltech/kawal.id/commit/4d9a1a045dcfd000c8d9af32f06473eea936dce9) |
| [40](https://github.com/kawaltech/kawal.id/actions/runs/39048748821/attempts/1) | 16:17:19 | push | [0453f3f](https://github.com/kawaltech/kawal.id/commit/0453f3fb405af6d931082b0e02f1423d03ed6eb8) | [0453f3f](https://github.com/kawaltech/kawal.id/commit/0453f3fb405af6d931082b0e02f1423d03ed6eb8) |
| [39](https://github.com/kawaltech/kawal.id/actions/runs/39048575886/attempts/1) | 16:14:59 | PR | [f73f7ca](https://github.com/kawaltech/kawal.id/commit/f73f7cad0263d10bc0ce8b21fd90d6cbe4428d2a) | [ad26461](https://github.com/kawaltech/kawal.id/commit/ad264613033bf84a3f59555a3867b8643a962175) |
| [38](https://github.com/kawaltech/kawal.id/actions/runs/39048573076/attempts/1) | 16:14:57 | push | [f73f7ca](https://github.com/kawaltech/kawal.id/commit/f73f7cad0263d10bc0ce8b21fd90d6cbe4428d2a) | [f73f7ca](https://github.com/kawaltech/kawal.id/commit/f73f7cad0263d10bc0ce8b21fd90d6cbe4428d2a) |
| [37](https://github.com/kawaltech/kawal.id/actions/runs/39048252208/attempts/1) | 16:10:27 | PR | [7f90fd0](https://github.com/kawaltech/kawal.id/commit/7f90fd021c3f401ad5e1a97d4a00d31a261ea5ac) | [19f6087](https://github.com/kawaltech/kawal.id/commit/19f60878d822849459422a12b85bd9722c318ef8) |
| [36](https://github.com/kawaltech/kawal.id/actions/runs/39048248101/attempts/1) | 16:10:24 | push | [7f90fd0](https://github.com/kawaltech/kawal.id/commit/7f90fd021c3f401ad5e1a97d4a00d31a261ea5ac) | [7f90fd0](https://github.com/kawaltech/kawal.id/commit/7f90fd021c3f401ad5e1a97d4a00d31a261ea5ac) |
| [35](https://github.com/kawaltech/kawal.id/actions/runs/39048011842/attempts/1) | 16:07:10 | PR | [a837b22](https://github.com/kawaltech/kawal.id/commit/a837b2270fe918f2044a914720cf32703fe22eaf) | [8e080aa](https://github.com/kawaltech/kawal.id/commit/8e080aaa2fb7c00ff183fe2c0a1c20b9f95961a4) |
| [34](https://github.com/kawaltech/kawal.id/actions/runs/39048005571/attempts/1) | 16:07:05 | push | [a837b22](https://github.com/kawaltech/kawal.id/commit/a837b2270fe918f2044a914720cf32703fe22eaf) | [a837b22](https://github.com/kawaltech/kawal.id/commit/a837b2270fe918f2044a914720cf32703fe22eaf) |
| [33](https://github.com/kawaltech/kawal.id/actions/runs/39047429801/attempts/1) | 15:59:12 | push | [8e74878](https://github.com/kawaltech/kawal.id/commit/8e748780d1109b4d25c865ec087faae56caba03a) | [8e74878](https://github.com/kawaltech/kawal.id/commit/8e748780d1109b4d25c865ec087faae56caba03a) |
| [32](https://github.com/kawaltech/kawal.id/actions/runs/39047277218/attempts/1) | 15:56:58 | PR | [5237797](https://github.com/kawaltech/kawal.id/commit/5237797d30f15c001b4725ac820e0544b119aef5) | [cb2762a](https://github.com/kawaltech/kawal.id/commit/cb2762a0651c66c13a7ab522e2e6e25846294db9) |

## Failures, retries, and skipped work

No workflow, setup, check, local-read, deployment, or post-deployment step
failed in this sample. This does not establish a failure rate for the wider
workflow history. Selection used creation order, not the result.

[Run 33](https://github.com/kawaltech/kawal.id/actions/runs/39047429801/attempts/1)
succeeded after four internal readiness probes. The first three returned an
older version; the fourth returned the expected version. Those retries are
inside its 27-second deployment step. They are not workflow reruns or four
deployment samples.

[Run 48](https://github.com/kawaltech/kawal.id/actions/runs/39052094799/attempts/1) and
[run 51](https://github.com/kawaltech/kawal.id/actions/runs/39052405792/attempts/1) each logged one
successful readiness probe. All three deployment runs passed the separate
post-deployment checks on both public hosts. This is recorded CI evidence,
not a new live check.

The remaining 17 deployment and post-deployment steps were skipped. Fifteen
were branch-push or PR runs. The other two were main documentation runs,
40 and 43. Skipped work is excluded from successful duration summaries.

The local health check also has retry commands. Its measured step duration
includes any retries that ran. This note does not assign a separate duration
to each internal HTTP attempt.

## Limits and next evidence

These observations cover 1 hour, 10 minutes, and 57 seconds of run creation
times on one day. PR and push runs often share a source revision. They are
not 20 independent releases. The sample includes different source revisions
and runner/cache conditions. It does not prove a performance change between
revisions.

All runs use the existing synthetic preview. There is no ingestion,
approved-public export pipeline, representative satellite-data volume, or
publication schedule in this measurement. A build of this preview does not
measure a future data release. The setup total includes tool and dependency
work; it is not a build-only measure.

Even the 20-value p95 estimates describe a small, mixed sample.
The current check set, deployment, and post-deployment each have only three
successful observations. Collect more representative releases with the same
check set before setting percentiles or a publication frequency. A future
measurement should include the agreed data size, source fetch time, queue
delay, validation, export generation, activation, and host checks.

This task ran no workflow, deployment, migration, or live-source request.
It changes no code or UI. Local validation checks the note's arithmetic,
source links, and patch whitespace. Application and UI checks are not claimed
for this document change.

The wider source, capacity, freshness, approval, and schedule decisions remain
with issue #5 and its accepted ADRs. The real-report recovery, privacy,
withdrawal, and rollback gates remain unchanged.
