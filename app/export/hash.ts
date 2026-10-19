// SHA-256 helpers for the export contract. Node-only: `node:crypto` keeps
// hashing synchronous for build scripts and tests. Do not import this module
// from browser-rendered components.
import { createHash } from "node:crypto";

import { canonicalJson, normalizeNumber } from "./canonical.ts";
import type { HashableExport } from "./types.ts";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** The four source fields that form a local observation key. */
export interface DetectionKey {
  sourceId: string;
  acquiredAt: string;
  latitude: number;
  longitude: number;
}

/**
 * C2 identity: the hash of the canonical tuple, not a FIRMS record ID. A
 * corrected location becomes a different key in a replacement snapshot.
 */
export function detectionId(key: DetectionKey): string {
  return sha256Hex(
    canonicalJson([
      key.sourceId,
      key.acquiredAt,
      normalizeNumber(key.latitude),
      normalizeNumber(key.longitude),
    ]),
  );
}

/**
 * Hash the full document except `exportId` and `contentHash`. Detections sort
 * by ID and sources by source ID first, so input order never changes the hash.
 * Identity fields are stripped here, so callers may pass a complete `ExportV1`.
 */
export function contentHash(
  document: HashableExport & { exportId?: string; contentHash?: string },
): string {
  const { exportId: _exportId, contentHash: _contentHash, ...body } = document;
  return sha256Hex(canonicalJson(canonicalExport(body)));
}

export function exportId(hash: string): string {
  return `sat-${hash}`;
}

/** Return a contract-ordered copy of the hashed document. */
export function canonicalExport(document: HashableExport): HashableExport {
  return {
    ...document,
    sources: [...document.sources]
      .map((source) => ({ ...source }))
      .sort((left, right) => compareText(left.sourceId, right.sourceId)),
    detections: [...document.detections]
      .map((detection) => ({ ...detection }))
      .sort((left, right) => compareText(left.id, right.id)),
  };
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
