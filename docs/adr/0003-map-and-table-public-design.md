---
status: accepted
date: 2026-10-16
---

# Use the map-and-table design for the public page

The user selected option B, "Peta dan tabel" (map and table), from three initial
visual options on 16 October 2026. Use it as the direction for the public page.

## Context

Three options used the same synthetic data and the same design language:

- **A, Warga dulu (residents first):** guidance first, then a map and one field report.
- **B, Peta dan tabel (map and table):** summary tiles, a map next to its table,
  shared filters, short guidance, and no field reports.
- **C, Catatan harian (daily record):** a dated record with a detection-time strip,
  field reports with their review history, and an English media briefing.

The review pages are in `app/routes/rancangan/`. They contain only synthetic data.

## Decision

- Use option B for the public page. Show satellite detections, their map and
  table, short resident guidance, and the data status.
- Keep field reports off this page. Put them on separate report pages.
- Keep the design language from Cukup
  ([zainfathoni/cukup](https://github.com/zainfathoni/cukup),
  `service/dashboard/dashboard.css` at commit `903a4e1`): paper background, 2px
  ink borders, hard offset shadows, rounded headings, mono labels, pastel guidance
  cards, and freshness labels that use shape and text, not only color.
- Use a greyer paper tone than Cukup. Use orange only for satellite detections.
  Use yellow for a selected control.
- Use system fonts and local files for map shapes and images. Do not load remote
  fonts, map tiles, or images.

## Rules for the page

- Every detection count states that a satellite detection is not a confirmed fire.
- Show the source, product, observation times in WIB, and the last successful update.
- When data is stale, show the time of the last successful update.
- When data is unavailable, show a dash and a notice. Never show zero.
- The map and the table use the same filters. The table is usable without the map.
- List provinces in alphabetical order. Do not show a ranking.
- Do not show sign-in, report forms, or upload controls until those features exist.

## Consequences

- The page contains no field reports. It can use the guidance and detection policy
  from [ADR 0002](0002-static-publication.md): five minutes of edge freshness and
  stale delivery for up to 24 hours if the origin fails. This needs a
  route-specific Caddy rule. The current default is the strict report policy.
- Do not add a report list, report count, or report preview to this page. That
  content would require the strict 60-second report policy.
- Report pages need their own design. They can reuse the report card and the
  review history from options A and C.
- The guidance text in the review pages is a placeholder. A health reviewer must
  approve the published guidance.
- Remove the `/rancangan` review routes before release. Build the public page from
  approved public data, not from the synthetic fixture.
