---
status: proposed
date: 2026-10-18
---

# Select an elevation source before real terrain or slope work

This is a proposal. It is not accepted scope. It does not authorize a download,
an integration, or a deployment.

The 3D prototype in [ADR 0009](0009-3d-incident-prototype.md) uses invented
terrain. The project has no real elevation, slope, or gradient data. Slope does
not change from hour to hour, so a static digital elevation model (DEM) is
sufficient. "Live" terrain data is not necessary. This record compares DEM
sources for Indonesia and their licences, so that a later decision can select one.

## Context

- [ADR 0007](0007-reliable-data-before-playback.md) puts reliable satellite data
  before playback and 3D. Real terrain is not in the current priority order.
- [ADR 0003](0003-map-and-table-public-design.md) prohibits remote map tiles. A
  public page must not request terrain from another server. Terrain must be
  processed at build time into local files.
- The public target is static ([ADR 0004](0004-void-static-deployment.md)).
  Every terrain file is part of each deployment.
- Most fires that cause haze burn on peat in Sumatra and Kalimantan. Peat is
  almost flat. Slope has a small effect there. Peat depth and water table have a
  larger effect. Slope is more important for upland fires, for example on
  mountains in Java or on savanna in Nusa Tenggara.
- Most global DEMs are surface models (DSM). In forest, a DSM measures the top of
  the canopy, not the ground. Slope from a DSM can be wrong at forest edges and in
  cleared plots.

## Sources compared

Licence status was checked on 18 October 2026. "Verified" means that we read the
licence text from the licensor. "Not verified" means that we found only a
secondary source, or that the licensor page did not load.

| Source | Grid | Surface | Licence summary | Licence status |
| --- | --- | --- | --- | --- |
| DEMNAS (BIG) | 0.27″, about 8 m | Not stated by BIG. Built from IFSAR, TerraSAR-X, and ALOS PALSAR. Expect canopy effects. | Free download after Ina-Geoportal sign-in. A secondary source says that the terms prohibit sale. A BIG catalogue entry shows "No License Provided". | Not verified. The terms page needs JavaScript and did not load. |
| Copernicus DEM GLO-30 | 1″, about 30 m | DSM (stated in the licence) | Free. Reproduction, distribution, public communication, and modification are permitted. Required notices and a liability sentence apply. | Verified from the licence PDF. |
| FABDEM | 1″, about 30 m | Forests and buildings removed with machine learning. Closest to bare ground. | Reported as CC BY-NC-SA 4.0: non-commercial, share-alike. A commercial licence is sold separately. | Not verified. Sources conflict, and the repository page timed out. |
| NASADEM (from SRTM) | 1″, about 30 m | Radar surface from 2000. Partial canopy effect. | USGS EROS and LP DAAC state no restrictions unless stated at receipt. Citation is requested. | Partly verified: the general policy only, not a NASADEM-specific page. |
| ALOS AW3D30 v4.1 (JAXA) | About 30 m | DSM (stated by JAXA) | Free for commercial and non-commercial use under the JAXA Terms for Use. Credit "© JAXA" for data used as supplied. Credit "Original data provided by JAXA" for processed data. | Partly verified. The dataset page is verified. The terms page did not load. |

### Copernicus GLO-30 obligations

The licence requires these items when we distribute modified data, such as
slope tiles or a terrain mesh:

- The notice: "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and ©
  Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the
  European Union and ESA; all rights reserved".
- The sentence: "The organisations in charge of the Copernicus programme by law
  or by delegation do not incur any liability for any use of the Copernicus
  WorldDEM-30".
- No statement or design that suggests endorsement by the Copernicus programme
  or by Airbus.
- The same obligations for subsequent users. Put the notice and the sentence in
  the public notice file that goes with the terrain files.

## Proposed decision

1. Before any real-terrain work, identify the reader question. Example: "Is this
   upland fire likely to move uphill towards a village?" Do not add slope only
   because the data is available.
2. Use Copernicus GLO-30 as the first source. Its licence is verified, it allows
   public distribution of modified data, and it covers all of Indonesia in one
   consistent product. Confirm that every tile in the selected areas is released.
3. Treat DEMNAS as a candidate upgrade for more detail. Ask BIG for written terms
   that cover public distribution of derived products, such as slope tiles and
   meshes. Do not publish DEMNAS derivatives before we have that answer.
4. Use FABDEM only for internal comparison of canopy effects. Do not publish
   FABDEM derivatives in the MIT repository or in the public build. Its reported
   non-commercial and share-alike terms would limit reuse by media and other
   readers.
5. Keep NASADEM as a fallback with no known restrictions. Keep AW3D30 as an
   alternative after we read the current JAXA terms.

## Processing and publication rules

- Process terrain at build time from a pinned source version. Record the tile
  identifiers, checksums, and processing steps. Do not download terrain in normal
  development or tests. Use small synthetic fixtures in orbs, as now.
- Limit terrain to selected areas. A national 30 m grid is too large for a static
  deployment. Measure file size and file count against the deployment limits
  before release.
- Show the source, the grid size, and the DSM limit on the page, for example:
  "Model permukaan: di hutan, ketinggian dapat menunjukkan puncak pohon."
- Add the source notices to `THIRD_PARTY_NOTICES.md` and to the public notice
  file.
- Terrain files contain no reports or personal data. A longer cache policy for
  them is possible. It needs a separate decision, because
  [ADR 0002](0002-static-publication.md) gives the one-year policy to code assets
  only.

## Local seed

On 19 October 2026, the user requested a local DEM seed for Indonesia and
selected GLO-90 (about 90 m). `pnpm seed:dem` downloads the tiles into the
ignored `.data/seed/` directory and makes a 30″ grid masked to Indonesia. It
records the tile checksums. It is for local inspection only. It does not
accept this proposal. It does not permit publication, a build input, or a test
fixture. Tests use synthetic tiles. The GLO-90 licence text was not read for
this seed. Read it and confirm its notice before any distribution.

## Open questions

- Which reader question and which areas come first?
- Do we show slope as a map layer, or only use it in a reviewed model?
- What grid size does that question need: 8 m (DEMNAS) or 30 m?
- Does BIG permit public distribution of DEMNAS derivatives, with which credit?
- Who reviews the terrain processing and its accuracy statement?

## References

- [Copernicus DEM GLO-30 licence (PDF)](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/DEM/resources/license/License-COPDEM-30.pdf)
- [Copernicus DEM GLO-30 in the Earth Engine catalogue](https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_DEM_GLO30_2024_1)
- [DEMNAS product page, BIG](https://big.go.id/en/content/Product/demnas)
- [DEMNAS download guide, BIG (PDF)](https://tanahair.indonesia.go.id/portal-web/static/Panduan%20Unduh%20Data%20Demnas.pdf)
- [Ina-Geoportal terms page](https://tanahair.indonesia.go.id/portal-web/termcondition)
- [BIG catalogue entry for the DEM index](https://tanahair.indonesia.go.id/sdi/dataset/indeks_dem_nasional)
- [AW3D30 dataset page, JAXA](https://www.eorc.jaxa.jp/ALOS/en/dataset/aw3d30/aw3d30_e.htm)
- [JAXA Terms for Use](https://earth.jaxa.jp/policy/en.html)
- [USGS EROS data use and citation](https://www.usgs.gov/centers/eros/science/usgs-eros-archive-data-use-and-citation)
- [NASADEM catalogue entry](https://www.earthdata.nasa.gov/data/catalog/lpcloud-nasadem-sc-001)
- [FABDEM in the community catalogue](https://gee-community-catalog.org/projects/fabdem/)
- [FABDEM licensing, Fathom](https://www.fathom.global/insight/fabdem-download/)
- Hawker et al. 2022, "A 30 m global map of elevation with forests and buildings
  removed", Environmental Research Letters 17(2), 024016,
  [doi:10.1088/1748-9326/ac4d4f](https://doi.org/10.1088/1748-9326/ac4d4f)
