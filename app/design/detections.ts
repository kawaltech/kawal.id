// Synthetic design-review data. These are not real satellite detections or reports.
// Detection points were placed inside Natural Earth province shapes with a seeded generator.

export type Confidence = "rendah" | "nominal" | "tinggi";

export interface Detection {
  id: string;
  acquiredAt: string;
  latitude: number;
  longitude: number;
  province: string;
  confidence: Confidence;
  satellite: "NOAA-20" | "NOAA-21";
}

export const DETECTIONS: Detection[] = [
  {
    id: "contoh-013",
    acquiredAt: "2026-10-15T18:36:00Z",
    latitude: -1.725,
    longitude: 103.245,
    province: "Jambi",
    confidence: "rendah",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-044",
    acquiredAt: "2026-10-15T18:36:00Z",
    latitude: -2.672,
    longitude: 113.876,
    province: "Kalimantan Tengah",
    confidence: "nominal",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-054",
    acquiredAt: "2026-10-15T18:36:00Z",
    latitude: -1.55,
    longitude: 114.965,
    province: "Kalimantan Tengah",
    confidence: "tinggi",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-023",
    acquiredAt: "2026-10-15T18:35:00Z",
    latitude: -3.689,
    longitude: 104.959,
    province: "Sumatra Selatan",
    confidence: "tinggi",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-036",
    acquiredAt: "2026-10-15T18:34:00Z",
    latitude: -1.997,
    longitude: 110.861,
    province: "Kalimantan Barat",
    confidence: "nominal",
    satellite: "NOAA-21"
  },
  {
    id: "contoh-024",
    acquiredAt: "2026-10-15T18:33:00Z",
    latitude: -3.743,
    longitude: 105.079,
    province: "Sumatra Selatan",
    confidence: "rendah",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-008",
    acquiredAt: "2026-10-15T18:31:00Z",
    latitude: 0.752,
    longitude: 101.065,
    province: "Riau",
    confidence: "rendah",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-011",
    acquiredAt: "2026-10-15T18:31:00Z",
    latitude: -1.839,
    longitude: 103.568,
    province: "Jambi",
    confidence: "nominal",
    satellite: "NOAA-21"
  },
  {
    id: "contoh-019",
    acquiredAt: "2026-10-15T18:31:00Z",
    latitude: -2.971,
    longitude: 105.153,
    province: "Sumatra Selatan",
    confidence: "tinggi",
    satellite: "NOAA-21"
  },
  {
    id: "contoh-031",
    acquiredAt: "2026-10-15T18:30:00Z",
    latitude: -1.143,
    longitude: 110.596,
    province: "Kalimantan Barat",
    confidence: "rendah",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-060",
    acquiredAt: "2026-10-15T18:30:00Z",
    latitude: -7.067,
    longitude: 138.882,
    province: "Papua",
    confidence: "nominal",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-001",
    acquiredAt: "2026-10-15T18:29:00Z",
    latitude: 1.159,
    longitude: 101.53,
    province: "Riau",
    confidence: "tinggi",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-009",
    acquiredAt: "2026-10-15T18:29:00Z",
    latitude: 1.1,
    longitude: 101.898,
    province: "Riau",
    confidence: "tinggi",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-012",
    acquiredAt: "2026-10-15T18:29:00Z",
    latitude: -1.281,
    longitude: 103.582,
    province: "Jambi",
    confidence: "nominal",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-029",
    acquiredAt: "2026-10-15T17:41:00Z",
    latitude: -3.336,
    longitude: 104.99,
    province: "Sumatra Selatan",
    confidence: "tinggi",
    satellite: "NOAA-21"
  },
  {
    id: "contoh-038",
    acquiredAt: "2026-10-15T17:40:00Z",
    latitude: -2.512,
    longitude: 114.31,
    province: "Kalimantan Tengah",
    confidence: "rendah",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-030",
    acquiredAt: "2026-10-15T17:39:00Z",
    latitude: -2.076,
    longitude: 110.609,
    province: "Kalimantan Barat",
    confidence: "tinggi",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-025",
    acquiredAt: "2026-10-15T17:38:00Z",
    latitude: -3.252,
    longitude: 105.642,
    province: "Sumatra Selatan",
    confidence: "nominal",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-041",
    acquiredAt: "2026-10-15T06:18:00Z",
    latitude: -2.74,
    longitude: 113.452,
    province: "Kalimantan Tengah",
    confidence: "nominal",
    satellite: "NOAA-21"
  },
  {
    id: "contoh-057",
    acquiredAt: "2026-10-15T06:18:00Z",
    latitude: -1.476,
    longitude: 115.139,
    province: "Kalimantan Tengah",
    confidence: "rendah",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-048",
    acquiredAt: "2026-10-15T06:17:00Z",
    latitude: -3.023,
    longitude: 113.695,
    province: "Kalimantan Tengah",
    confidence: "nominal",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-040",
    acquiredAt: "2026-10-15T06:16:00Z",
    latitude: -2.502,
    longitude: 114.479,
    province: "Kalimantan Tengah",
    confidence: "nominal",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-058",
    acquiredAt: "2026-10-15T06:16:00Z",
    latitude: -7.317,
    longitude: 139.366,
    province: "Papua",
    confidence: "nominal",
    satellite: "NOAA-21"
  },
  {
    id: "contoh-010",
    acquiredAt: "2026-10-15T06:15:00Z",
    latitude: -1.517,
    longitude: 103.314,
    province: "Jambi",
    confidence: "nominal",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-018",
    acquiredAt: "2026-10-15T06:12:00Z",
    latitude: -2.97,
    longitude: 104.966,
    province: "Sumatra Selatan",
    confidence: "tinggi",
    satellite: "NOAA-21"
  },
  {
    id: "contoh-022",
    acquiredAt: "2026-10-15T06:12:00Z",
    latitude: -3.167,
    longitude: 105.415,
    province: "Sumatra Selatan",
    confidence: "nominal",
    satellite: "NOAA-21"
  },
  {
    id: "contoh-042",
    acquiredAt: "2026-10-15T06:11:00Z",
    latitude: -2.229,
    longitude: 114.38,
    province: "Kalimantan Tengah",
    confidence: "nominal",
    satellite: "NOAA-21"
  },
  {
    id: "contoh-014",
    acquiredAt: "2026-10-15T05:24:00Z",
    latitude: -1.865,
    longitude: 103.323,
    province: "Jambi",
    confidence: "rendah",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-026",
    acquiredAt: "2026-10-15T05:23:00Z",
    latitude: -3.738,
    longitude: 105.242,
    province: "Sumatra Selatan",
    confidence: "tinggi",
    satellite: "NOAA-21"
  },
  {
    id: "contoh-015",
    acquiredAt: "2026-10-15T05:22:00Z",
    latitude: -1.221,
    longitude: 103.592,
    province: "Jambi",
    confidence: "nominal",
    satellite: "NOAA-21"
  },
  {
    id: "contoh-027",
    acquiredAt: "2026-10-15T05:21:00Z",
    latitude: -3.619,
    longitude: 105.654,
    province: "Sumatra Selatan",
    confidence: "nominal",
    satellite: "NOAA-21"
  },
  {
    id: "contoh-049",
    acquiredAt: "2026-10-15T05:21:00Z",
    latitude: -2.532,
    longitude: 114.035,
    province: "Kalimantan Tengah",
    confidence: "rendah",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-003",
    acquiredAt: "2026-10-15T05:19:00Z",
    latitude: 1.46,
    longitude: 101.939,
    province: "Riau",
    confidence: "nominal",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-059",
    acquiredAt: "2026-10-15T05:18:00Z",
    latitude: -7.522,
    longitude: 139.201,
    province: "Papua",
    confidence: "nominal",
    satellite: "NOAA-21"
  },
  {
    id: "contoh-043",
    acquiredAt: "2026-10-15T05:17:00Z",
    latitude: -2.813,
    longitude: 114.248,
    province: "Kalimantan Tengah",
    confidence: "tinggi",
    satellite: "NOAA-21"
  },
  {
    id: "contoh-051",
    acquiredAt: "2026-10-15T05:17:00Z",
    latitude: -2.5,
    longitude: 114.5,
    province: "Kalimantan Tengah",
    confidence: "nominal",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-020",
    acquiredAt: "2026-10-14T18:36:00Z",
    latitude: -3.158,
    longitude: 105.727,
    province: "Sumatra Selatan",
    confidence: "nominal",
    satellite: "NOAA-21"
  },
  {
    id: "contoh-055",
    acquiredAt: "2026-10-14T18:35:00Z",
    latitude: -1.535,
    longitude: 115.186,
    province: "Kalimantan Tengah",
    confidence: "nominal",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-016",
    acquiredAt: "2026-10-14T18:34:00Z",
    latitude: -1.862,
    longitude: 103.698,
    province: "Jambi",
    confidence: "rendah",
    satellite: "NOAA-21"
  },
  {
    id: "contoh-017",
    acquiredAt: "2026-10-14T18:34:00Z",
    latitude: -3.709,
    longitude: 105.678,
    province: "Sumatra Selatan",
    confidence: "rendah",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-034",
    acquiredAt: "2026-10-14T18:34:00Z",
    latitude: -1.556,
    longitude: 111.1,
    province: "Kalimantan Tengah",
    confidence: "rendah",
    satellite: "NOAA-21"
  },
  {
    id: "contoh-050",
    acquiredAt: "2026-10-14T18:32:00Z",
    latitude: -3.109,
    longitude: 113.696,
    province: "Kalimantan Tengah",
    confidence: "rendah",
    satellite: "NOAA-21"
  },
  {
    id: "contoh-046",
    acquiredAt: "2026-10-14T17:40:00Z",
    latitude: -2.614,
    longitude: 113.415,
    province: "Kalimantan Tengah",
    confidence: "nominal",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-047",
    acquiredAt: "2026-10-14T06:24:00Z",
    latitude: -2.369,
    longitude: 113.311,
    province: "Kalimantan Tengah",
    confidence: "rendah",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-007",
    acquiredAt: "2026-10-14T06:23:00Z",
    latitude: 0.556,
    longitude: 101.966,
    province: "Riau",
    confidence: "nominal",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-006",
    acquiredAt: "2026-10-14T06:20:00Z",
    latitude: 1.056,
    longitude: 101.726,
    province: "Riau",
    confidence: "nominal",
    satellite: "NOAA-21"
  },
  {
    id: "contoh-039",
    acquiredAt: "2026-10-14T06:18:00Z",
    latitude: -2.208,
    longitude: 113.866,
    province: "Kalimantan Tengah",
    confidence: "nominal",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-053",
    acquiredAt: "2026-10-14T05:29:00Z",
    latitude: -2.582,
    longitude: 114.062,
    province: "Kalimantan Tengah",
    confidence: "nominal",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-035",
    acquiredAt: "2026-10-14T05:28:00Z",
    latitude: -1.385,
    longitude: 110.706,
    province: "Kalimantan Barat",
    confidence: "nominal",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-033",
    acquiredAt: "2026-10-14T05:27:00Z",
    latitude: -1.362,
    longitude: 110.179,
    province: "Kalimantan Barat",
    confidence: "nominal",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-032",
    acquiredAt: "2026-10-14T05:26:00Z",
    latitude: -1.066,
    longitude: 110.314,
    province: "Kalimantan Barat",
    confidence: "tinggi",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-005",
    acquiredAt: "2026-10-14T05:25:00Z",
    latitude: 1.218,
    longitude: 101.143,
    province: "Riau",
    confidence: "rendah",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-028",
    acquiredAt: "2026-10-14T05:23:00Z",
    latitude: -3.172,
    longitude: 105.213,
    province: "Sumatra Selatan",
    confidence: "tinggi",
    satellite: "NOAA-21"
  },
  {
    id: "contoh-045",
    acquiredAt: "2026-10-13T18:30:00Z",
    latitude: -2.231,
    longitude: 114.163,
    province: "Kalimantan Tengah",
    confidence: "nominal",
    satellite: "NOAA-21"
  },
  {
    id: "contoh-056",
    acquiredAt: "2026-10-13T18:29:00Z",
    latitude: -1.036,
    longitude: 115.331,
    province: "Kalimantan Tengah",
    confidence: "nominal",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-037",
    acquiredAt: "2026-10-13T18:25:00Z",
    latitude: -1.006,
    longitude: 110.125,
    province: "Kalimantan Barat",
    confidence: "nominal",
    satellite: "NOAA-21"
  },
  {
    id: "contoh-021",
    acquiredAt: "2026-10-13T18:24:00Z",
    latitude: -3.115,
    longitude: 105.531,
    province: "Sumatra Selatan",
    confidence: "rendah",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-052",
    acquiredAt: "2026-10-13T06:28:00Z",
    latitude: -2.316,
    longitude: 113.761,
    province: "Kalimantan Tengah",
    confidence: "nominal",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-002",
    acquiredAt: "2026-10-13T06:27:00Z",
    latitude: 0.849,
    longitude: 101.662,
    province: "Riau",
    confidence: "nominal",
    satellite: "NOAA-20"
  },
  {
    id: "contoh-004",
    acquiredAt: "2026-10-13T06:25:00Z",
    latitude: 0.493,
    longitude: 102.076,
    province: "Riau",
    confidence: "nominal",
    satellite: "NOAA-21"
  }
];
