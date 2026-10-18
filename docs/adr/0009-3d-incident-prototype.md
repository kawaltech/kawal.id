---
status: accepted
date: 2026-10-18
---

# Build a synthetic 3D incident prototype as a review route

On 18 October 2026, the user requested a map feature like a 3D wildfire forensic
tool. The reference showed terrain, a modelled spread path, perimeters, layers,
a timeline, key events, weather, and small charts. The user selected a 3D
prototype over 2D playback and over a proposal only.
[ADR 0007](0007-reliable-data-before-playback.md) defers interactive 3D and
modelled spread. This decision makes one limited exception for design review.
It does not change the ADR 0007 priority order for product work.

## Decision

- Add the prototype at `/rancangan/d` in the static public target. It is a
  design-review route, like options A to C. It does not replace option B.
- Use only synthetic data in `app/design/scenario.ts`. The place, names, fire,
  weather, suppression records, and satellite records are invented. The page
  says so in the review bar, the title area, the map badge, and the method notes.
- Generate the terrain in the browser from seeded noise. Draw all map layers into
  a local canvas. Do not load remote map tiles, images, or fonts. This keeps the
  [ADR 0003](0003-map-and-table-public-design.md) rule.
- Use three.js 0.186.1 for the 3D view. Load it with a dynamic import on this
  page only. Prerendering does not run WebGL. Without WebGL, the page shows the
  same painted map from above.
- Keep orange for satellite detections only. Show the modelled front in a rose
  colour. Label the spread, perimeter, rate, and head path as a model, not an
  observation. Show the ignition area as an estimate. Do not show a cause.
- Show satellite passes as discrete observations. Mark a cloud-covered pass. Do
  not show it as zero detections.
- Keep a table of the same passes, events, model values, and detections. The
  table is usable without the map.
- Do not show drone tracking or firefighting-resource tracking. ADR 0007 still
  defers them.
- Do not import the scenario or the incident components into the private app.
  Lint enforces this boundary.
- On 18 October 2026, the user supplied a layout in
  `templates/Kawal Asap Analisis.dc.html`. The page follows that layout: a
  summary strip, the map next to weather, a layer panel inside the map, a
  full-width timeline with collapsible events, charts, and a collapsible table.
  The template loads Geist from Google Fonts. The page uses system fonts
  instead, because ADR 0003 prohibits remote fonts.

## Consequences

- The prototype adds about 140 kB (gzip) of 3D code to `/rancangan/d` only.
  Other public pages do not load it.
- The spread "model" is a drawing aid. It is not a fire-behaviour model. Do not
  connect it to real data without a separate decision about model source,
  validation, and how the page explains uncertainty.
- Remove the `/rancangan` review routes before release, as ADR 0003 requires.
- A real 3D product feature still needs a separate decision. That decision must
  identify the reader question, the data sources, the terrain source and its
  licence, and the withdrawal and caching rules under
  [ADR 0002](0002-static-publication.md).
