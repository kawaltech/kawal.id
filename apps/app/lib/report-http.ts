import type { CloudContext } from "void";
import { ValidationError } from "void/handler";

/** Form fields of an action request, from a form post or a JSON body. Files are ignored. */
export async function readFields(c: CloudContext): Promise<Record<string, string>> {
  const type = c.req.header("content-type") ?? "";
  const raw: Record<string, unknown> = type.includes("application/json")
    ? ((await c.req.json().catch(() => ({}))) as Record<string, unknown>)
    : ((await c.req.parseBody()) as Record<string, unknown>);
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (typeof value === "string") fields[key] = value;
    else if (typeof value === "number") fields[key] = String(value);
  }
  return fields;
}

/** A positive integer version from a form field, or null. */
export function readVersion(value: string | undefined): number | null {
  const version = Number(value);
  return Number.isSafeInteger(version) && version > 0 ? version : null;
}

/** Throws field messages for the form. Void sends them as a 422 response. */
export function invalid(errors: Record<string, string | undefined>): never {
  throw new ValidationError(
    Object.fromEntries(Object.entries(errors).filter(([, value]) => value)) as Record<
      string,
      string
    >,
  );
}

/**
 * The report changed after the page loaded, or the member may no longer make
 * this change. Nothing was written.
 */
export function conflict(c: CloudContext) {
  return c.json(
    {
      message:
        "Laporan ini sudah berubah, atau Anda tidak dapat lagi melakukan perubahan ini. Tidak ada yang disimpan. Muat ulang halaman, lalu coba lagi.",
    },
    409,
  );
}

/** A report that does not exist, or that this member may not see. */
export function notFound() {
  return new Response("Laporan tidak ditemukan.", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}
