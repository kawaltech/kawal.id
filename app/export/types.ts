// Contract types for the approved-public satellite export. This module is
// Node-only shared code: it must not import synthetic design data, React, or
// any app runtime. See docs/plans/reliable-satellite-release.md contracts C1
// to C3 and docs/plans/wp2-export-contract.md.

export const SCHEMA_VERSION = 1 as const;
export const WINDOW_HOURS = 72 as const;
export const WINDOW_MS = WINDOW_HOURS * 60 * 60 * 1000;

export const CONFIDENCES = ["rendah", "nominal", "tinggi"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const DAYNIGHTS = ["D", "N"] as const;
export type DayNight = (typeof DAYNIGHTS)[number];

export const SATELLITES = ["NOAA-20", "NOAA-21"] as const;
export type Satellite = (typeof SATELLITES)[number];

/** Pinned C1 identities. Region and request URL are provenance, not identity. */
export const SOURCE_IDS = {
  "NOAA-20": "firms-viirs-noaa20-c2-nrt",
  "NOAA-21": "firms-viirs-noaa21-c2-nrt",
} as const;
export type SourceId = (typeof SOURCE_IDS)[Satellite];

export const REQUIRED_SOURCE_IDS: readonly SourceId[] = [
  SOURCE_IDS["NOAA-20"],
  SOURCE_IDS["NOAA-21"],
];

export const SOURCE_STATUSES = ["ok", "invalid", "failed"] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

/** C1 provenance for one complete source file, without credentials. */
export interface SourceSnapshot {
  sourceId: SourceId;
  url: string;
  retrievedAt: string;
  lastModified: string | null;
  etag: string | null;
  sha256: string;
  bytes: number;
  rows: number;
  status: SourceStatus;
  reason?: string;
}

/** Every input row is classified exactly once, in this order. */
export const INVALID_REASONS = [
  "badNumber",
  "badTime",
  "badConfidence",
  "badDaynight",
  "badSatellite",
  "badVersion",
  "outOfRegion",
] as const;
export type InvalidReason = (typeof INVALID_REASONS)[number];

export type InvalidCounts = Record<InvalidReason, number>;

export interface ExportCounts {
  accepted: number;
  duplicate: number;
  outsideIndonesia: number;
  outsideWindow: number;
  invalid: InvalidCounts;
  byProvince: Record<string, number>;
}

/** C2 detection. A satellite detection is not a confirmed fire. */
export interface Detection {
  id: string;
  sourceId: SourceId;
  acquiredAt: string;
  latitude: number;
  longitude: number;
  satellite: Satellite;
  confidence: Confidence;
  daynight: DayNight;
  province: string;
  version: string;
  frp: number | null;
  scan: number | null;
  track: number | null;
}

export interface BoundaryProvenance {
  name: string;
  version: string;
  licence: string;
  sha256: string;
}

export interface ExportApproval {
  policy: string;
  holds: string[];
}

/**
 * C3 approved-public export, version 1. One JSON document with a validator in
 * shared code. It contains no report, user, session, review, or private field.
 */
export interface ExportV1 {
  schemaVersion: typeof SCHEMA_VERSION;
  exportId: string;
  synthetic: boolean;
  createdAt: string;
  windowEnd: string;
  windowHours: typeof WINDOW_HOURS;
  checkedAt: string;
  /**
   * Earliest usable `lastModified` over the required sources. `null` means at
   * least one source has no usable file time, which requires an open hold.
   */
  sourceUpdatedAt: string | null;
  latestObservationAt: string | null;
  sources: SourceSnapshot[];
  boundary: BoundaryProvenance;
  approval: ExportApproval;
  counts: ExportCounts;
  detections: Detection[];
  contentHash: string;
}

/** The hashed part of C3: everything except `exportId` and `contentHash`. */
export type HashableExport = Omit<ExportV1, "exportId" | "contentHash">;
