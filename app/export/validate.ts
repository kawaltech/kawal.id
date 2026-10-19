// Validator for the approved-public satellite export (C3) and its detections
// (C2). The public build and the publication run must use this module. It is
// Node-only shared code and must not import app or design modules.

import { isUtcMinute, isUtcSecond, utcMilliseconds } from "./canonical.ts";
import { contentHash, detectionId, exportId as makeExportId } from "./hash.ts";
import {
  CONFIDENCES,
  DAYNIGHTS,
  INVALID_REASONS,
  REQUIRED_SOURCE_IDS,
  SATELLITES,
  SCHEMA_VERSION,
  SOURCE_IDS,
  SOURCE_STATUSES,
  WINDOW_HOURS,
  WINDOW_MS,
  type Detection,
  type ExportCounts,
  type ExportV1,
  type SourceId,
  type SourceSnapshot,
} from "./types.ts";

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };

export interface ValidateOptions {
  /** Production builds set false and reject synthetic exports. */
  allowSynthetic?: boolean;
}

export class ExportValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    const first = issues[0];
    super(
      `Invalid satellite export (${issues.length} issue${issues.length === 1 ? "" : "s"}): ` +
        `${first?.path ?? "$"} ${first?.message ?? ""}`,
    );
    this.name = "ExportValidationError";
    this.issues = issues;
  }
}

export function checkExport(
  input: unknown,
  options: ValidateOptions = {},
): ValidationResult<ExportV1> {
  const issues = dedupe(collectExportIssues(input, options));
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: input as ExportV1 };
}

export function validateExport(input: unknown, options: ValidateOptions = {}): ExportV1 {
  const result = checkExport(input, options);
  if (!result.ok) throw new ExportValidationError(result.issues);
  return result.value;
}

const EXPORT_KEYS = [
  "schemaVersion",
  "exportId",
  "synthetic",
  "createdAt",
  "windowEnd",
  "windowHours",
  "checkedAt",
  "sourceUpdatedAt",
  "latestObservationAt",
  "sources",
  "boundary",
  "approval",
  "counts",
  "detections",
  "contentHash",
] as const;

const SOURCE_KEYS = [
  "sourceId",
  "url",
  "retrievedAt",
  "lastModified",
  "etag",
  "sha256",
  "bytes",
  "rows",
  "status",
  "reason",
] as const;

const DETECTION_KEYS = [
  "id",
  "sourceId",
  "acquiredAt",
  "latitude",
  "longitude",
  "satellite",
  "confidence",
  "daynight",
  "province",
  "version",
  "frp",
  "scan",
  "track",
] as const;

const BOUNDARY_KEYS = ["name", "version", "licence", "sha256"] as const;
const APPROVAL_KEYS = ["policy", "holds"] as const;
const COUNTS_KEYS = [
  "accepted",
  "duplicate",
  "outsideIndonesia",
  "outsideWindow",
  "invalid",
  "byProvince",
] as const;

const FORBIDDEN_PREFIXES = ["report", "review", "user", "session", "account", "verification"];
const EXPORT_ID = /^sat-[0-9a-f]{64}$/;
const HEX_64 = /^[0-9a-f]{64}$/;
const PROVINCE_SLUG = /^[a-z0-9-]+$/;
const SOURCE_COLLECTION = /-c([1-9]\d*)-nrt$/;
const SOURCE_VERSION = /^([1-9]\d*)\.(\d+)NRT$/;

function collectExportIssues(input: unknown, options: ValidateOptions): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) {
    push(issues, "$", "must be a JSON object");
    return issues;
  }

  scanForbiddenKeys(input, "$", issues);
  rejectUnknownKeys(input, EXPORT_KEYS, "$", issues);

  if (input.schemaVersion !== SCHEMA_VERSION) {
    push(issues, "$.schemaVersion", `must be ${SCHEMA_VERSION}`);
  }
  if (typeof input.synthetic !== "boolean") {
    push(issues, "$.synthetic", "must be a boolean");
  } else if (input.synthetic && options.allowSynthetic === false) {
    push(issues, "$.synthetic", "production builds reject synthetic exports");
  }

  for (const key of ["createdAt", "windowEnd", "checkedAt"] as const) {
    if (!isUtcString(input[key], isUtcSecond)) {
      push(issues, `$.${key}`, "must be an ISO UTC timestamp at second precision");
    }
  }
  if (input.sourceUpdatedAt !== null && !isUtcString(input.sourceUpdatedAt, isUtcSecond)) {
    push(issues, "$.sourceUpdatedAt", "must be null or an ISO UTC timestamp at second precision");
  }
  if (input.latestObservationAt !== null && !isUtcString(input.latestObservationAt, isUtcMinute)) {
    push(
      issues,
      "$.latestObservationAt",
      "must be null or an ISO UTC timestamp at minute precision",
    );
  }
  if (input.windowHours !== WINDOW_HOURS) {
    push(issues, "$.windowHours", `must be ${WINDOW_HOURS}`);
  }

  if (typeof input.exportId !== "string" || !EXPORT_ID.test(input.exportId)) {
    push(issues, "$.exportId", 'must be "sat-" followed by a full SHA-256');
  }
  if (!isHex64(input.contentHash)) {
    push(issues, "$.contentHash", "must be a lowercase SHA-256");
  }

  const synthetic = input.synthetic === true;
  const sources = validateSources(input.sources, "$.sources", issues, synthetic);
  const boundary = validateBoundary(input.boundary, "$.boundary", issues);
  const approval = validateApproval(input.approval, "$.approval", issues);
  const counts = validateCounts(input.counts, "$.counts", issues);
  const detections = validateDetections(input.detections, "$.detections", issues);

  if (
    sources === undefined ||
    boundary === undefined ||
    approval === undefined ||
    counts === undefined ||
    detections === undefined
  ) {
    return issues;
  }
  if (issues.length > 0) return issues;

  crossCheckExport(input as unknown as ExportV1, sources, detections, counts, issues);
  return issues;
}

function validateSources(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  synthetic: boolean,
): SourceSnapshot[] | undefined {
  if (!Array.isArray(value)) {
    push(issues, path, "must be an array");
    return undefined;
  }
  const before = issues.length;
  const seen = new Set<string>();

  value.forEach((entry, index) => {
    const at = `${path}[${index}]`;
    if (!isRecord(entry)) {
      push(issues, at, "must be an object");
      return;
    }
    rejectUnknownKeys(entry, SOURCE_KEYS, at, issues);

    const sourceId = entry.sourceId;
    if (typeof sourceId !== "string" || !REQUIRED_SOURCE_IDS.includes(sourceId as SourceId)) {
      push(issues, `${at}.sourceId`, `must be one of ${REQUIRED_SOURCE_IDS.join(", ")}`);
    } else if (seen.has(sourceId)) {
      push(issues, `${at}.sourceId`, "duplicate source");
    } else {
      seen.add(sourceId);
    }

    if (typeof entry.url !== "string" || entry.url.length === 0) {
      push(issues, `${at}.url`, "must be a non-empty URL without credentials");
    } else if (synthetic) {
      if (!entry.url.startsWith("synthetic://")) {
        push(issues, `${at}.url`, "synthetic exports require a synthetic:// URL");
      }
    } else if (!isSafeProductionUrl(entry.url)) {
      push(
        issues,
        `${at}.url`,
        "production sources require an https:// URL with a host and no credentials, query, or fragment",
      );
    }

    if (!isUtcString(entry.retrievedAt, isUtcSecond)) {
      push(issues, `${at}.retrievedAt`, "must be an ISO UTC timestamp at second precision");
    }
    if (entry.lastModified !== null && !isUtcString(entry.lastModified, isUtcSecond)) {
      push(issues, `${at}.lastModified`, "must be null or an ISO UTC timestamp");
    }
    if (entry.etag !== null && typeof entry.etag !== "string") {
      push(issues, `${at}.etag`, "must be null or a string");
    }
    if (!isHex64(entry.sha256)) {
      push(issues, `${at}.sha256`, "must be a lowercase SHA-256");
    }
    if (!isNonNegativeInteger(entry.bytes)) {
      push(issues, `${at}.bytes`, "must be a non-negative integer");
    }
    if (!isNonNegativeInteger(entry.rows)) {
      push(issues, `${at}.rows`, "must be a non-negative integer");
    }

    if (!SOURCE_STATUSES.includes(entry.status as (typeof SOURCE_STATUSES)[number])) {
      push(issues, `${at}.status`, `must be one of ${SOURCE_STATUSES.join(", ")}`);
    } else if (entry.status !== "ok" && !isNonEmptyString(entry.reason)) {
      push(issues, `${at}.reason`, "a non-ok source needs a reason");
    } else if (entry.reason !== undefined && !isNonEmptyString(entry.reason)) {
      push(issues, `${at}.reason`, "must be a non-empty string");
    }
  });

  for (const required of REQUIRED_SOURCE_IDS) {
    if (!seen.has(required)) push(issues, path, `missing required source ${required}`);
  }

  return issues.length === before ? (value as SourceSnapshot[]) : undefined;
}

function validateDetections(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): Detection[] | undefined {
  if (!Array.isArray(value)) {
    push(issues, path, "must be an array");
    return undefined;
  }
  const before = issues.length;
  const seen = new Set<string>();

  value.forEach((entry, index) => {
    const at = `${path}[${index}]`;
    if (!isRecord(entry)) {
      push(issues, at, "must be an object");
      return;
    }
    rejectUnknownKeys(entry, DETECTION_KEYS, at, issues);

    if (!isHex64(entry.id)) {
      push(issues, `${at}.id`, "must be a lowercase SHA-256");
    }
    if (!isUtcString(entry.acquiredAt, isUtcMinute)) {
      push(issues, `${at}.acquiredAt`, "must be an ISO UTC timestamp at minute precision");
    }
    if (!isCoordinate(entry.latitude, 90)) {
      push(issues, `${at}.latitude`, "must be a finite number from -90 to 90");
    }
    if (!isCoordinate(entry.longitude, 180)) {
      push(issues, `${at}.longitude`, "must be a finite number from -180 to 180");
    }

    if (!SATELLITES.includes(entry.satellite as (typeof SATELLITES)[number])) {
      push(issues, `${at}.satellite`, `must be one of ${SATELLITES.join(", ")}`);
    } else if (entry.sourceId !== SOURCE_IDS[entry.satellite as (typeof SATELLITES)[number]]) {
      push(issues, `${at}.sourceId`, "must agree with the satellite");
    } else if (!REQUIRED_SOURCE_IDS.includes(entry.sourceId as SourceId)) {
      push(issues, `${at}.sourceId`, "must be a required source");
    }

    if (!CONFIDENCES.includes(entry.confidence as (typeof CONFIDENCES)[number])) {
      push(issues, `${at}.confidence`, `must be one of ${CONFIDENCES.join(", ")}`);
    }
    if (!DAYNIGHTS.includes(entry.daynight as (typeof DAYNIGHTS)[number])) {
      push(issues, `${at}.daynight`, `must be one of ${DAYNIGHTS.join(", ")}`);
    }
    if (typeof entry.province !== "string" || !PROVINCE_SLUG.test(entry.province)) {
      push(issues, `${at}.province`, "must be a lowercase code, such as jambi, or luar-provinsi");
    }
    const versionCollection =
      typeof entry.version === "string" ? SOURCE_VERSION.exec(entry.version)?.[1] : undefined;
    if (versionCollection === undefined) {
      push(issues, `${at}.version`, "must use <collection>.<revision>NRT, such as 2.0NRT");
    } else {
      const expectedCollection =
        typeof entry.sourceId === "string"
          ? SOURCE_COLLECTION.exec(entry.sourceId)?.[1]
          : undefined;
      if (expectedCollection !== undefined && versionCollection !== expectedCollection) {
        push(issues, `${at}.version`, `collection must agree with ${String(entry.sourceId)}`);
      }
    }
    for (const field of ["frp", "scan", "track"] as const) {
      if (entry[field] !== null && !isFiniteNumber(entry[field])) {
        push(issues, `${at}.${field}`, "must be null or a finite number");
      }
    }

    if (
      typeof entry.sourceId === "string" &&
      typeof entry.acquiredAt === "string" &&
      isFiniteNumber(entry.latitude) &&
      isFiniteNumber(entry.longitude)
    ) {
      const expected = detectionId({
        sourceId: entry.sourceId,
        acquiredAt: entry.acquiredAt,
        latitude: entry.latitude,
        longitude: entry.longitude,
      });
      if (typeof entry.id === "string" && entry.id !== expected) {
        push(issues, `${at}.id`, "does not match the observation tuple");
      }
    }

    if (typeof entry.id === "string") {
      if (seen.has(entry.id)) push(issues, `${at}.id`, "duplicate detection id");
      else seen.add(entry.id);
    }
  });

  return issues.length === before ? (value as Detection[]) : undefined;
}

function validateCounts(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): ExportCounts | undefined {
  if (!isRecord(value)) {
    push(issues, path, "must be an object");
    return undefined;
  }
  const before = issues.length;
  rejectUnknownKeys(value, COUNTS_KEYS, path, issues);

  for (const key of ["accepted", "duplicate", "outsideIndonesia", "outsideWindow"] as const) {
    if (!isNonNegativeInteger(value[key])) {
      push(issues, `${path}.${key}`, "must be a non-negative integer");
    }
  }

  if (!isRecord(value.invalid)) {
    push(issues, `${path}.invalid`, "must be an object");
  } else {
    const at = `${path}.invalid`;
    rejectUnknownKeys(value.invalid, INVALID_REASONS, at, issues);
    for (const reason of INVALID_REASONS) {
      if (!isNonNegativeInteger(value.invalid[reason])) {
        push(issues, `${at}.${reason}`, "must be a non-negative integer");
      }
    }
  }

  if (!isRecord(value.byProvince)) {
    push(issues, `${path}.byProvince`, "must be an object");
  } else {
    for (const [province, count] of Object.entries(value.byProvince)) {
      if (!PROVINCE_SLUG.test(province)) {
        push(issues, `${path}.byProvince.${province}`, "must be a lowercase province code");
      }
      if (!isNonNegativeInteger(count)) {
        push(issues, `${path}.byProvince.${province}`, "must be a non-negative integer");
      }
    }
  }

  return issues.length === before ? (value as unknown as ExportCounts) : undefined;
}

function validateBoundary(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): ExportV1["boundary"] | undefined {
  if (!isRecord(value)) {
    push(issues, path, "must be an object");
    return undefined;
  }
  const before = issues.length;
  rejectUnknownKeys(value, BOUNDARY_KEYS, path, issues);
  for (const key of ["name", "version", "licence"] as const) {
    if (!isNonEmptyString(value[key])) push(issues, `${path}.${key}`, "must be a non-empty string");
  }
  if (!isHex64(value.sha256)) push(issues, `${path}.sha256`, "must be a lowercase SHA-256");
  return issues.length === before ? (value as unknown as ExportV1["boundary"]) : undefined;
}

function validateApproval(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): ExportV1["approval"] | undefined {
  if (!isRecord(value)) {
    push(issues, path, "must be an object");
    return undefined;
  }
  const before = issues.length;
  rejectUnknownKeys(value, APPROVAL_KEYS, path, issues);
  if (!isNonEmptyString(value.policy)) push(issues, `${path}.policy`, "must be a non-empty string");
  if (!Array.isArray(value.holds)) {
    push(issues, `${path}.holds`, "must be an array");
  } else {
    value.holds.forEach((hold, index) => {
      if (!isNonEmptyString(hold)) {
        push(issues, `${path}.holds[${index}]`, "must be a non-empty string");
      }
    });
  }
  return issues.length === before ? (value as unknown as ExportV1["approval"]) : undefined;
}

function crossCheckExport(
  document: ExportV1,
  sources: SourceSnapshot[],
  detections: Detection[],
  counts: ExportCounts,
  issues: ValidationIssue[],
): void {
  const end = utcMilliseconds(document.windowEnd);
  const start = end - WINDOW_MS;

  detections.forEach((detection, index) => {
    const at = utcMilliseconds(detection.acquiredAt);
    if (!(at > start && at <= end)) {
      push(
        issues,
        `$.detections[${index}].acquiredAt`,
        "must be inside (windowEnd - 72h, windowEnd]",
      );
    }
  });

  const latest = detections.reduce<string | null>(
    (current, detection) =>
      current === null || detection.acquiredAt > current ? detection.acquiredAt : current,
    null,
  );
  if (document.latestObservationAt !== latest) {
    push(issues, "$.latestObservationAt", "must be the newest detection time, or null");
  }

  const earliestRetrieved = sources
    .map((source) => source.retrievedAt)
    .sort((left, right) => compareText(left, right))[0];
  if (document.windowEnd !== earliestRetrieved) {
    push(issues, "$.windowEnd", "must be the earliest source retrievedAt");
  }

  const modified = sources.map((source) => source.lastModified);
  if (modified.every((value): value is string => value !== null)) {
    const earliestModified = [...modified].sort((left, right) => compareText(left, right))[0];
    if (document.sourceUpdatedAt !== earliestModified) {
      push(issues, "$.sourceUpdatedAt", "must be the earliest source lastModified");
    }
  } else {
    if (document.sourceUpdatedAt !== null) {
      push(issues, "$.sourceUpdatedAt", "must be null when a source has no usable lastModified");
    }
    if (document.approval.holds.length === 0) {
      push(issues, "$.approval.holds", "a missing source file time requires an open hold");
    }
  }

  if (counts.accepted !== detections.length) {
    push(issues, "$.counts.accepted", "must equal the number of detections");
  }

  const expectedByProvince = new Map<string, number>();
  for (const detection of detections) {
    expectedByProvince.set(
      detection.province,
      (expectedByProvince.get(detection.province) ?? 0) + 1,
    );
  }
  const provinces = new Set([...Object.keys(counts.byProvince), ...expectedByProvince.keys()]);
  for (const province of provinces) {
    const actual = Object.hasOwn(counts.byProvince, province) ? counts.byProvince[province] : 0;
    if (actual !== (expectedByProvince.get(province) ?? 0)) {
      push(issues, `$.counts.byProvince.${province}`, "must equal the number of accepted rows");
    }
  }

  const bucketTotal =
    counts.accepted +
    counts.duplicate +
    counts.outsideIndonesia +
    counts.outsideWindow +
    INVALID_REASONS.reduce((total, reason) => total + counts.invalid[reason], 0);
  const sourceRows = sources.reduce((total, source) => total + source.rows, 0);
  if (bucketTotal !== sourceRows) {
    push(issues, "$.counts", `must classify all ${sourceRows} source rows, got ${bucketTotal}`);
  }

  const acceptedBySource = new Map<string, number>();
  for (const detection of detections) {
    acceptedBySource.set(detection.sourceId, (acceptedBySource.get(detection.sourceId) ?? 0) + 1);
  }
  sources.forEach((source, index) => {
    const accepted = acceptedBySource.get(source.sourceId) ?? 0;
    if (accepted > source.rows) {
      push(
        issues,
        `$.sources[${index}].rows`,
        "must be at least the accepted count for this source",
      );
    }
  });

  if (detections.length === 0 && sources.some((source) => source.status !== "ok")) {
    push(issues, "$.detections", "a zero export requires every source to be ok");
  }
  if (detections.length === 0 && document.approval.holds.length > 0) {
    push(issues, "$.approval.holds", "a zero export requires no open hold");
  }

  const { exportId: claimedId, contentHash: claimedHash } = document;
  const computed = contentHash(document);
  if (claimedHash !== computed) {
    push(issues, "$.contentHash", "does not match the canonical document");
  }
  if (claimedId !== makeExportId(claimedHash)) {
    push(issues, "$.exportId", "must be sat- followed by contentHash");
  }
}

function scanForbiddenKeys(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanForbiddenKeys(entry, `${path}[${index}]`, issues));
    return;
  }
  if (!isRecord(value)) return;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_PREFIXES.some((prefix) => key.toLowerCase().startsWith(prefix))) {
      push(issues, `${path}.${key}`, "private fields are not allowed in a satellite export");
    }
    scanForbiddenKeys(value[key], `${path}.${key}`, issues);
  }
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: ValidationIssue[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) push(issues, `${path}.${key}`, "unknown field");
  }
}

function dedupe(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.path}\u0000${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function push(issues: ValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Method A (direct file) provenance: HTTPS with a host and no user
 * information, query, or fragment. Method B (MAP_KEY path) needs its own rule
 * under D2.
 */
function isSafeProductionUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.hostname.length > 0 &&
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === ""
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isCoordinate(value: unknown, limit: number): value is number {
  return isFiniteNumber(value) && value >= -limit && value <= limit;
}

function isHex64(value: unknown): value is string {
  return typeof value === "string" && HEX_64.test(value);
}

function isUtcString(value: unknown, check: (value: string) => boolean): value is string {
  return typeof value === "string" && check(value);
}
