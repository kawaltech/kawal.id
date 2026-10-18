// File and network helpers for the local seed scripts.
import { createHash } from "node:crypto";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface Download {
  url: string;
  body: Buffer;
  bytes: number;
  sha256: string;
  etag: string | null;
  lastModified: string | null;
  retrievedAt: string;
}

export function sha256(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Replace a file only after the complete new content is on disk. */
export function writeFileAtomic(path: string, data: Uint8Array | string) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, data);
    renameSync(temporary, path);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

/** Download one complete file. Only HTTP 200 with a matching length is accepted. */
export async function download(
  fetch: Fetch,
  url: string,
  options: { attempts?: number; timeoutMs?: number; now?: () => Date } = {},
): Promise<Download> {
  const { attempts = 3, timeoutMs = 300_000, now = () => new Date() } = options;
  let failure: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (response.status !== 200) {
        await response.body?.cancel();
        const error = new Error(`${url} returned HTTP ${response.status}`);
        if (response.status < 500) throw Object.assign(error, { final: true });
        throw error;
      }
      const body = Buffer.from(await response.arrayBuffer());
      const length = response.headers.get("content-length");
      if (length !== null && Number(length) !== body.length) {
        throw new Error(`${url} ended after ${body.length} of ${length} bytes`);
      }
      return {
        url,
        body,
        bytes: body.length,
        sha256: sha256(body),
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
        retrievedAt: now().toISOString(),
      };
    } catch (error) {
      failure = error;
      if ((error as { final?: boolean }).final || attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
  throw failure;
}
