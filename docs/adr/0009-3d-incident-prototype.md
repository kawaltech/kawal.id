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

## Local seed preview (19 October 2026)

On 19 October 2026, the user requested an Indonesia map from `/rancangan/d`
that uses the local FIRMS and DEM seeds. This amendment adds
`/rancangan/d/indonesia`. The synthetic incident page does not change.

- The page shows NASA FIRMS VIIRS NRT detections from NOAA-20 and NOAA-21 for
  the last 7 days, Copernicus DEM GLO-90 heights in 30″ cells, ESA WorldCover
  2021 land cover, and Natural Earth 1:10m rivers, lakes, and places, over
  Indonesia. The `pnpm seed:*` commands make the data. On 19 October 2026 the
  user also approved the land cover, the Natural Earth layers, and finer
  terrain on zoom.
- When the view is narrow, the development server makes a 2° × 2° detail
  patch at 6″ from the cached tiles. The relief exaggeration falls as the view
  narrows, to 1.5× in a local view.
- Only the local development server provides the data. A Vite plugin with
  `apply: "serve"` reads `.data/seed` and sends compact files under
  `/__seed/indonesia/`. The plugin does not run in builds. The static build and
  the public site show a notice that the data is unavailable.
  `check-public-build.mjs` rejects seed files and seed markers in the output.
- The page draws all layers in the browser from local files. It loads no
  remote tiles, images, or fonts.
- Orange stays reserved for satellite detections. The page states that a
  detection is not a confirmed fire. It shows the source and download times,
  and a table of the same filtered data.
- Island groups come from the simplified Natural Earth outline, not from
  approved province boundaries. The tables list them in alphabetical order.
- This is not product scope. It does not accept ADR 0010, the satellite-release
  plan, or a publication path. It does not lift the ADR 0007 deferrals. Do not
  deploy seed data.

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
