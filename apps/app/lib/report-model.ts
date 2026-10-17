// Report workflow vocabulary and validation. No Void or database imports, so
// pages, loaders, the store, and tests can all use it.

export const REPORT_STATES = ["draft", "in_review", "approved", "rejected", "discarded"] as const;
export type ReportState = (typeof REPORT_STATES)[number];

export const STATE_LABELS: Record<ReportState, string> = {
  draft: "Draf",
  in_review: "Dalam tinjauan",
  approved: "Disetujui",
  rejected: "Ditolak",
  discarded: "Dibuang",
};

export const DECISIONS = ["approve", "request_changes", "reject"] as const;
export type Decision = (typeof DECISIONS)[number];

export const DECISION_LABELS: Record<Decision, string> = {
  approve: "Setujui",
  request_changes: "Minta perubahan",
  reject: "Tolak",
};

export const SOURCE_CHANNELS = ["in_person", "phone", "messaging", "other"] as const;
export type SourceChannel = (typeof SOURCE_CHANNELS)[number];

export const SOURCE_LABELS: Record<SourceChannel, string> = {
  in_person: "Langsung",
  phone: "Telepon",
  messaging: "Pesan",
  other: "Lainnya",
};

/** The 38 provinces of Indonesia, in alphabetical order. */
export const PROVINCES = [
  "Aceh",
  "Bali",
  "Banten",
  "Bengkulu",
  "Daerah Istimewa Yogyakarta",
  "DKI Jakarta",
  "Gorontalo",
  "Jambi",
  "Jawa Barat",
  "Jawa Tengah",
  "Jawa Timur",
  "Kalimantan Barat",
  "Kalimantan Selatan",
  "Kalimantan Tengah",
  "Kalimantan Timur",
  "Kalimantan Utara",
  "Kepulauan Bangka Belitung",
  "Kepulauan Riau",
  "Lampung",
  "Maluku",
  "Maluku Utara",
  "Nusa Tenggara Barat",
  "Nusa Tenggara Timur",
  "Papua",
  "Papua Barat",
  "Papua Barat Daya",
  "Papua Pegunungan",
  "Papua Selatan",
  "Papua Tengah",
  "Riau",
  "Sulawesi Barat",
  "Sulawesi Selatan",
  "Sulawesi Tengah",
  "Sulawesi Tenggara",
  "Sulawesi Utara",
  "Sumatera Barat",
  "Sumatera Selatan",
  "Sumatera Utara",
] as const;

export const LIMITS = { title: 120, account: 2000, area: 120, note: 1000 } as const;

/** Observation times can be at most this far after the server clock. */
const FUTURE_SKEW_MS = 10 * 60_000;

/** The fields of an open revision as the author edits them. */
export type DraftFields = {
  title: string;
  account: string;
  /** WIB wall-clock time from a datetime-local input, such as 2026-10-17T14:30. */
  observedAtWib: string;
  province: string;
  area: string;
  sourceChannel: string;
};

/** Validated revision content, as stored. NULL means the author has not filled it in. */
export type RevisionContent = {
  title: string;
  account: string | null;
  observedAt: string | null;
  province: string | null;
  area: string | null;
  sourceChannel: SourceChannel | null;
};

export type FieldErrors = Partial<Record<keyof DraftFields, string>>;

const WIB_OFFSET_MS = 7 * 3_600_000;

/** Normalizes line ends and removes control characters except tab and newline. */
function clean(value: unknown): string {
  return typeof value === "string"
    ? value
        .replace(/\r\n?/g, "\n")
        // oxlint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
        .trim()
    : "";
}

/** Converts a WIB wall-clock value to UTC ISO time, or null when it is not valid. */
export function wibInputToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const utc = Date.UTC(year, month - 1, day, hour, minute) - WIB_OFFSET_MS;
  const check = new Date(utc + WIB_OFFSET_MS);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59
  ) {
    return null;
  }
  return new Date(utc).toISOString();
}

/** Converts a stored UTC time to a datetime-local value in WIB. */
export function isoToWibInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(Date.parse(iso) + WIB_OFFSET_MS).toISOString().slice(0, 16);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** Formats a UTC time in WIB, such as "17 Okt 2026 14.30 WIB". */
export function formatWib(iso: string | null): string {
  if (!iso) return "—";
  const shifted = new Date(Date.parse(iso) + WIB_OFFSET_MS);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${shifted.getUTCDate()} ${MONTHS[shifted.getUTCMonth()]} ${shifted.getUTCFullYear()} ${pad(shifted.getUTCHours())}.${pad(shifted.getUTCMinutes())} WIB`;
}

function isSourceChannel(value: string): value is SourceChannel {
  return (SOURCE_CHANNELS as readonly string[]).includes(value);
}

function isProvince(value: string) {
  return (PROVINCES as readonly string[]).includes(value);
}

/**
 * Validates draft fields. A draft needs only a title. With `complete`, every
 * field is necessary, as for a submission.
 */
export function validateDraft(
  input: Partial<Record<keyof DraftFields, unknown>>,
  { complete, now = new Date() }: { complete: boolean; now?: Date },
): { ok: true; content: RevisionContent } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const title = clean(input.title);
  const account = clean(input.account);
  const observedAtWib = clean(input.observedAtWib);
  const province = clean(input.province);
  const area = clean(input.area);
  const sourceChannel = clean(input.sourceChannel);

  if (!title) errors.title = "Tulis judul laporan.";
  else if (title.length > LIMITS.title)
    errors.title = `Judul paling banyak ${LIMITS.title} karakter.`;

  if (account.length > LIMITS.account)
    errors.account = `Keterangan paling banyak ${LIMITS.account} karakter.`;
  else if (complete && !account) errors.account = "Tulis apa yang diamati.";

  let observedAt: string | null = null;
  if (observedAtWib) {
    observedAt = wibInputToIso(observedAtWib);
    if (!observedAt) errors.observedAtWib = "Waktu pengamatan tidak valid.";
    else if (Date.parse(observedAt) > now.getTime() + FUTURE_SKEW_MS)
      errors.observedAtWib = "Waktu pengamatan tidak boleh di masa depan.";
  } else if (complete) errors.observedAtWib = "Isi waktu pengamatan.";

  if (province && !isProvince(province)) errors.province = "Pilih provinsi dari daftar.";
  else if (complete && !province) errors.province = "Pilih provinsi.";

  if (area.length > LIMITS.area) errors.area = `Wilayah paling banyak ${LIMITS.area} karakter.`;
  else if (complete && !area) errors.area = "Tulis nama kecamatan atau desa.";

  if (sourceChannel && !isSourceChannel(sourceChannel))
    errors.sourceChannel = "Pilih sumber laporan dari daftar.";
  else if (complete && !sourceChannel) errors.sourceChannel = "Pilih sumber laporan.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    content: {
      title,
      account: account || null,
      observedAt,
      province: province || null,
      area: area || null,
      sourceChannel: isSourceChannel(sourceChannel) ? sourceChannel : null,
    },
  };
}

export type DecisionErrors = Partial<Record<"decision" | "note", string>>;

export function validateDecision(input: {
  decision?: unknown;
  note?: unknown;
}): { ok: true; decision: Decision; note: string | null } | { ok: false; errors: DecisionErrors } {
  const decision = clean(input.decision);
  const note = clean(input.note);
  const errors: DecisionErrors = {};
  if (!(DECISIONS as readonly string[]).includes(decision)) errors.decision = "Pilih keputusan.";
  if (note.length > LIMITS.note) errors.note = `Catatan paling banyak ${LIMITS.note} karakter.`;
  else if (decision !== "approve" && !note)
    errors.note = "Tulis alasan untuk penulis. Catatan wajib untuk keputusan ini.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, decision: decision as Decision, note: note || null };
}
