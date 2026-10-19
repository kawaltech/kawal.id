---
status: accepted
date: 2026-10-17
---

# Deliver reliable public data before observation playback

The user accepted this priority order on 17 October 2026. Keep the private
draft/review decision moving, then deliver a reliable satellite-data release
before adding time playback. Defer interactive 3D: reliable observations and
reviewed information offer more immediate value to residents than a detailed
terrain scene.

## Decision

1. Review and decide the private draft/review proposal. Build only the approved
   slice. Approval of that proposal's preparation is not approval of its product
   rules or implementation.
2. Deliver satellite ingestion and the public map/table with source and
   observation times, validation, ordered export activation, and clear stale
   and unavailable states. Address map aggregation and table pagination as
   capacity needs of this release, not as optional visual work.
3. Complete the controls required for each public release. Public field reports
   also need privacy rules, withdrawal-safe rollback, and recovery checks under
   [ADR 0002](0002-static-publication.md). Health guidance needs expert review.
   These controls are release prerequisites, not work to postpone until after
   publication.
4. Consider 2D observation playback after the first reliable public-data release.
   First identify a reader question that playback helps answer. Show discrete
   satellite observations, not continuous fire spread or confirmed boundaries.

Keep option B, shared map/table filters, and the accessible table under
[ADR 0003](0003-map-and-table-public-design.md). Keep public reads static and
independent of app requests and database access under
[ADR 0004](0004-void-static-deployment.md).

## Deferred work and open choices

- Interactive 3D is not the default phase after playback.
  [ADR 0009](0009-3d-incident-prototype.md) adds one synthetic 3D review
  prototype. It does not change this priority order. Defer it, modeled fire
  spread, fire perimeters, cause attribution, drones, and firefighting-resource
  tracking until a separate decision establishes their value and data support.
- Assess residents' need for haze, air-quality information, and reviewed guidance
  before 3D. This does not select a data source or authorize an integration.
- Export approval policy, ingestion scheduling, and detailed playback scope still
  need decisions. This ADR does not select a rendering engine or commit to effort
  estimates.
- This priority decision does not authorize implementation, remote writes,
  deployment, or a change to existing release controls.

## References

- [Priority decision and assessment](https://ampcode.com/threads/T-01a148b2-4f62-77f8-a630-05331d916d6f)
- [Current roadmap discussion](https://ampcode.com/threads/T-01a145d5-526c-7226-a388-20d220c2e184)
- [Opus 5.5 second opinion](https://ampcode.com/threads/T-01a148bc-3574-76bc-b702-8c1375717620)
