// Synthetic content for the visual design review. Nothing here is a real report,
// reviewed guidance, or live satellite data.
import { DETECTIONS, type Detection } from "./detections";

export type FeedState = "segar" | "usang" | "tidak-tersedia";

export interface FeedStatus {
  state: FeedState;
  product: string;
  source: string;
  lastAttemptAt: string;
  lastSuccessAt: string | null;
}

export interface FieldReport {
  id: string;
  title: string;
  testimony: string;
  area: string;
  province: string;
  latitude: number;
  longitude: number;
  observedAt: string;
  publishedAt: string;
  reviewer: string;
  revision: string;
  reuse: string;
  publicCopy: string;
}

export interface GuidanceItem {
  id: string;
  title: string;
  body: string;
  tone: "sky" | "mint" | "rose";
}

export interface DesignFixture {
  generatedAt: string;
  feeds: Record<FeedState, FeedStatus>;
  detections: Detection[];
  reports: FieldReport[];
  guidance: GuidanceItem[];
}

const product = "VIIRS NRT, satelit NOAA-20 dan NOAA-21";
const source = "NASA FIRMS (contoh, belum tersambung)";

export function designFixture(): DesignFixture {
  return {
    generatedAt: "2026-10-16T00:30:00Z",
    feeds: {
      segar: {
        state: "segar",
        product,
        source,
        lastAttemptAt: "2026-10-16T00:20:00Z",
        lastSuccessAt: "2026-10-16T00:20:00Z",
      },
      usang: {
        state: "usang",
        product,
        source,
        lastAttemptAt: "2026-10-16T00:20:00Z",
        lastSuccessAt: "2026-10-15T06:20:00Z",
      },
      "tidak-tersedia": {
        state: "tidak-tersedia",
        product,
        source,
        lastAttemptAt: "2026-10-16T00:20:00Z",
        lastSuccessAt: null,
      },
    },
    detections: DETECTIONS,
    reports: [
      {
        id: "laporan-contoh-02",
        title: "Asap tebal menutup jalan desa sejak subuh",
        testimony:
          "Jarak pandang di jalan desa sekitar 50 meter. Warga menutup jendela. Sebagian anak tidak berangkat ke sekolah.",
        area: "Kecamatan Contoh Hilir",
        province: "Kalimantan Tengah",
        latitude: -2.7,
        longitude: 114.1,
        observedAt: "2026-10-15T22:40:00Z",
        publishedAt: "2026-10-16T00:10:00Z",
        reviewer: "Peninjau A (contoh)",
        revision: "Revisi 1. Belum ada koreksi.",
        reuse: "CC BY 4.0 (contoh; belum ditetapkan)",
        publicCopy: "Foto salinan publik. Wajah dan pelat nomor sudah disamarkan.",
      },
      {
        id: "laporan-contoh-01",
        title: "Bau asap terasa di dalam rumah pada malam hari",
        testimony:
          "Bau asap masuk ke rumah setelah pukul 18.00. Langit kuning keabu-abuan. Pelapor tidak melihat api.",
        area: "Kecamatan Contoh Utara",
        province: "Riau",
        latitude: 0.8,
        longitude: 101.5,
        observedAt: "2026-10-15T11:10:00Z",
        publishedAt: "2026-10-15T14:00:00Z",
        reviewer: "Peninjau B (contoh)",
        revision: "Revisi 2. Lokasi diperbaiki menjadi tingkat kecamatan.",
        reuse: "CC BY 4.0 (contoh; belum ditetapkan)",
        publicCopy: "Foto salinan publik. Data lokasi dalam berkas sudah dihapus.",
      },
    ],
    guidance: [
      {
        id: "kurangi-paparan",
        title: "Kurangi paparan asap",
        body: "Saat asap tebal, kurangi kegiatan di luar ruangan. Tutup jendela dan pintu. Pilih satu ruangan yang paling rapat untuk beristirahat.",
        tone: "sky",
      },
      {
        id: "lindungi-rentan",
        title: "Perhatikan kelompok rentan",
        body: "Anak, lansia, ibu hamil, dan orang dengan penyakit jantung atau paru perlu perhatian lebih. Periksa keadaan mereka beberapa kali sehari.",
        tone: "mint",
      },
      {
        id: "cari-bantuan",
        title: "Kenali tanda bahaya",
        body: "Jika sesak napas, nyeri dada, atau pusing berat, segera cari pertolongan di fasilitas kesehatan terdekat atau hubungi 119.",
        tone: "rose",
      },
    ],
  };
}

export const WINDOWS = [24, 48, 72] as const;
export type WindowHours = (typeof WINDOWS)[number];
export const CONFIDENCES = ["tinggi", "nominal", "rendah"] as const;

/** Detections known at the last successful update, inside the selected window. */
export function visibleDetections(
  fixture: Pick<DesignFixture, "feeds" | "detections">,
  state: FeedState,
  windowHours: number,
  confidences: readonly string[],
): Detection[] | null {
  const feed = fixture.feeds[state];
  if (!feed.lastSuccessAt) return null;
  const end = Date.parse(feed.lastSuccessAt);
  const start = end - windowHours * 3_600_000;
  return fixture.detections.filter((detection) => {
    const at = Date.parse(detection.acquiredAt);
    return at <= end && at > start && confidences.includes(detection.confidence);
  });
}

/** Deterministic formatting keeps prerendered HTML and hydration identical. */
export function formatWib(iso: string) {
  const day = wibDay(iso);
  const date = new Date(`${day}T00:00:00Z`);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${formatWibTime(iso)} WIB`;
}

const WIB_OFFSET = 7 * 3_600_000;

/** Calendar day key in WIB, such as 2026-10-16. */
export function wibDay(iso: string) {
  return new Date(Date.parse(iso) + WIB_OFFSET).toISOString().slice(0, 10);
}

/** Hours since WIB midnight, from 0 to 24. */
export function wibHour(iso: string) {
  const shifted = new Date(Date.parse(iso) + WIB_OFFSET);
  return shifted.getUTCHours() + shifted.getUTCMinutes() / 60;
}

export function formatWibTime(iso: string) {
  const shifted = new Date(Date.parse(iso) + WIB_OFFSET);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(shifted.getUTCHours())}.${pad(shifted.getUTCMinutes())}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export function formatDay(day: string, withWeekday = false) {
  const date = new Date(`${day}T00:00:00Z`);
  const text = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  return withWeekday ? `${DAYS[date.getUTCDay()]}, ${text}` : text;
}
