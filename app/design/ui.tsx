import { useMemo, useState } from "react";
import { Link } from "react-router";

import type { Detection } from "./detections";
import {
  CONFIDENCES,
  WINDOWS,
  formatWib,
  visibleDetections,
  type DesignFixture,
  type FeedState,
  type FeedStatus,
  type FieldReport,
  type GuidanceItem,
} from "./fixture";
import { INDONESIA_PATH, MAP_ORIGIN, MAP_SCALE, NEIGHBOUR_PATH } from "./map-geometry";

export const FEED_LABELS: Record<FeedState, string> = {
  segar: "Data segar",
  usang: "Data usang",
  "tidak-tersedia": "Data tidak tersedia",
};

export function useDesignState(fixture: Pick<DesignFixture, "feeds" | "detections">) {
  const [state, setState] = useState<FeedState>("segar");
  const [windowHours, setWindowHours] = useState<number>(24);
  const [confidences, setConfidences] = useState<string[]>([...CONFIDENCES]);
  const detections = useMemo(
    () => visibleDetections(fixture, state, windowHours, confidences),
    [fixture, state, windowHours, confidences],
  );
  const toggleConfidence = (value: string) =>
    setConfidences((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  return {
    feed: fixture.feeds[state],
    state,
    setState,
    windowHours,
    setWindowHours,
    confidences,
    toggleConfidence,
    detections,
  };
}

export function ReviewBar({
  option,
  state,
  setState,
}: {
  option: string;
  state: FeedState;
  setState: (state: FeedState) => void;
}) {
  return (
    <aside className="review-bar" aria-label="Kontrol tinjauan desain" lang="en">
      <p>
        <strong>Design review · option {option}</strong>{" "}
        <span className="muted">Synthetic data. Not a fire information service.</span>{" "}
        <Link to="/rancangan">All options</Link>
      </p>
      <fieldset className="segmented">
        <legend className="sr-only">Preview the data state</legend>
        {(Object.keys(FEED_LABELS) as FeedState[]).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={state === value}
            onClick={() => setState(value)}
            lang="id"
          >
            {FEED_LABELS[value]}
          </button>
        ))}
      </fieldset>
    </aside>
  );
}

export function SkipLink() {
  return (
    <a className="skip-link" href="#isi">
      Langsung ke isi
    </a>
  );
}

export function Masthead({
  nav,
  children,
}: {
  nav: { href: string; label: string }[];
  children?: React.ReactNode;
}) {
  return (
    <header className="ka-top">
      <p className="wordmark">
        <span className="wordmark-name">Kawal Asap</span>
        <span className="wordmark-tag">kawal.id</span>
      </p>
      {children}
      <nav aria-label="Bagian halaman">
        <ul>
          {nav.map((item) => (
            <li key={item.href}>
              <a href={item.href}>{item.label}</a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

export function FreshnessPill({ feed }: { feed: FeedStatus }) {
  const text =
    feed.state === "segar" && feed.lastSuccessAt
      ? `Diperbarui ${formatWib(feed.lastSuccessAt)}`
      : feed.state === "usang" && feed.lastSuccessAt
        ? `Usang · terakhir berhasil ${formatWib(feed.lastSuccessAt)}`
        : "Data deteksi tidak tersedia";
  return (
    <p className={`freshness ${feed.state}`} role="status">
      <span className="freshness-mark" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}

export function FeedNotice({ feed }: { feed: FeedStatus }) {
  if (feed.state === "segar") return null;
  if (feed.state === "usang")
    return (
      <div className="panel-notice usang">
        <p>
          <strong>Data ini usang.</strong> Pembaruan pada {formatWib(feed.lastAttemptAt)} gagal.
          Kami menampilkan data terakhir yang berhasil diambil pada{" "}
          {formatWib(feed.lastSuccessAt!)}.
        </p>
        <p>Deteksi baru setelah waktu itu tidak tampil di sini.</p>
      </div>
    );
  return (
    <div className="panel-notice tidak-tersedia">
      <p>
        <strong>Data deteksi tidak tersedia.</strong> Pengambilan pada{" "}
        {formatWib(feed.lastAttemptAt)} gagal, dan belum ada data yang dapat ditampilkan.
      </p>
      <p>Ini tidak berarti tidak ada titik panas. Periksa sumber resmi, misalnya BMKG.</p>
    </div>
  );
}

export function DetectionFigure({
  detections,
  feed,
  windowHours,
}: {
  detections: Detection[] | null;
  feed: FeedStatus;
  windowHours: number;
}) {
  return (
    <div>
      <p className="figure-row" aria-live="polite">
        <span className="big-figure">{detections ? detections.length : "—"}</span>
        <span className="muted">deteksi titik panas dari satelit</span>
      </p>
      <p className="figure-caption">
        {feed.lastSuccessAt
          ? `Dalam ${windowHours} jam sampai ${formatWib(feed.lastSuccessAt)}. `
          : "Jumlah tidak diketahui karena data tidak tersedia. "}
        Satu kebakaran dapat menghasilkan beberapa deteksi. Deteksi belum tentu kebakaran yang
        terkonfirmasi.
      </p>
    </div>
  );
}

export function Filters({
  windowHours,
  setWindowHours,
  confidences,
  toggleConfidence,
  disabled,
}: {
  windowHours: number;
  setWindowHours: (hours: number) => void;
  confidences: string[];
  toggleConfidence: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="controls">
      <fieldset className="segmented" disabled={disabled}>
        <legend>Rentang waktu</legend>
        {WINDOWS.map((hours) => (
          <button
            key={hours}
            type="button"
            aria-pressed={windowHours === hours}
            onClick={() => setWindowHours(hours)}
          >
            {hours} jam
          </button>
        ))}
      </fieldset>
      <fieldset className="segmented" disabled={disabled}>
        <legend>Tingkat keyakinan satelit</legend>
        {CONFIDENCES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={confidences.includes(value)}
            onClick={() => toggleConfidence(value)}
          >
            {value[0].toUpperCase() + value.slice(1)}
          </button>
        ))}
      </fieldset>
    </div>
  );
}

const VIEWS = {
  nasional: { x: 0, y: 0, width: 950, height: 370 },
  pilot: { x: 15, y: 0, width: 500, height: 280 },
} as const;
export type MapView = keyof typeof VIEWS;

const project = (longitude: number, latitude: number) => ({
  x: (longitude - MAP_ORIGIN.longitude) * MAP_SCALE,
  y: (MAP_ORIGIN.latitude - latitude) * MAP_SCALE,
});

export function HotspotMap({
  detections,
  reports = [],
  view,
  caption,
}: {
  detections: Detection[] | null;
  reports?: FieldReport[];
  view: MapView;
  caption?: React.ReactNode;
}) {
  const box = VIEWS[view];
  const zoom = 950 / box.width;
  const radius = 5.5 / Math.sqrt(zoom);
  const stroke = 1 / zoom;
  const summary = detections
    ? `Peta ${view === "pilot" ? "Sumatra dan Kalimantan" : "Indonesia"} dengan ${detections.length} deteksi satelit dan ${reports.length} laporan lapangan. Tabel di bawah peta memuat data yang sama.`
    : "Peta tanpa deteksi karena data tidak tersedia.";
  return (
    <figure className="map-figure">
      <svg
        viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
        role="img"
        aria-label={summary}
      >
        <path className="map-other" d={NEIGHBOUR_PATH} strokeWidth={0.75 * stroke} />
        <path className="map-land" d={INDONESIA_PATH} strokeWidth={stroke} />
        {detections?.map((detection) => {
          const point = project(detection.longitude, detection.latitude);
          return (
            <circle
              key={detection.id}
              className={`map-detection ${detection.confidence}`}
              cx={point.x}
              cy={point.y}
              r={radius}
              strokeWidth={2 * stroke}
            >
              <title>
                {`Deteksi satelit · ${formatWib(detection.acquiredAt)} · ${detection.province} · keyakinan ${detection.confidence}`}
              </title>
            </circle>
          );
        })}
        {reports.map((report) => {
          const point = project(report.longitude, report.latitude);
          const size = radius * 2.1;
          return (
            <rect
              key={report.id}
              className="map-report"
              x={point.x - size / 2}
              y={point.y - size / 2}
              width={size}
              height={size}
              rx={1.5 * stroke}
              strokeWidth={2 * stroke}
            >
              <title>{`Laporan lapangan yang sudah ditinjau · ${report.area}, ${report.province}`}</title>
            </rect>
          );
        })}
        {!detections && (
          <text
            className="map-empty"
            x={box.x + box.width / 2}
            y={box.y + box.height - 18 / zoom}
            textAnchor="middle"
            fontSize={15 / zoom}
          >
            Data deteksi tidak tersedia — bukan berarti nol
          </text>
        )}
      </svg>
      <figcaption>
        {caption ??
          "Peta dasar: Natural Earth (domain publik). Lokasi laporan dibulatkan ke tingkat kecamatan."}
      </figcaption>
    </figure>
  );
}

export function MapLegend({ withReports = true }: { withReports?: boolean }) {
  return (
    <ul className="legend" aria-label="Keterangan peta">
      <li>
        <svg viewBox="0 0 18 18" aria-hidden="true">
          <circle className="map-detection" cx="9" cy="9" r="6" />
        </svg>
        Deteksi satelit (titik panas), belum tentu kebakaran
      </li>
      <li>
        <svg viewBox="0 0 18 18" aria-hidden="true">
          <circle className="map-detection rendah" cx="9" cy="9" r="6" />
        </svg>
        Deteksi keyakinan rendah
      </li>
      {withReports && (
        <li>
          <svg viewBox="0 0 18 18" aria-hidden="true">
            <rect className="map-report" x="3" y="3" width="12" height="12" rx="2" />
          </svg>
          Laporan lapangan yang sudah ditinjau
        </li>
      )}
    </ul>
  );
}

export function provinceCounts(detections: Detection[]) {
  const counts = new Map<string, number>();
  for (const detection of detections)
    counts.set(detection.province, (counts.get(detection.province) ?? 0) + 1);
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b, "id"));
}

export function ProvinceTable({ detections }: { detections: Detection[] | null }) {
  if (!detections) return <p className="muted">Data tidak tersedia. Jumlah tidak diketahui.</p>;
  return (
    <div className="table-scroll">
      <table>
        <caption>
          Deteksi per provinsi
          <span className="muted small"> · urut abjad, bukan peringkat</span>
        </caption>
        <thead>
          <tr>
            <th scope="col">Provinsi</th>
            <th scope="col" className="num">
              Deteksi
            </th>
          </tr>
        </thead>
        <tbody>
          {provinceCounts(detections).map(([province, count]) => (
            <tr key={province}>
              <td>{province}</td>
              <td className="num">{count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DetectionTable({ detections }: { detections: Detection[] | null }) {
  if (!detections)
    return <p className="muted">Tabel kosong karena data tidak tersedia, bukan karena nol.</p>;
  return (
    <div className="table-scroll">
      <table>
        <caption className="sr-only">Daftar deteksi satelit</caption>
        <thead>
          <tr>
            <th scope="col">Waktu (WIB)</th>
            <th scope="col">Provinsi</th>
            <th scope="col">Koordinat</th>
            <th scope="col">Keyakinan</th>
            <th scope="col">Satelit</th>
          </tr>
        </thead>
        <tbody>
          {detections.map((detection) => (
            <tr key={detection.id}>
              <td>{formatWib(detection.acquiredAt).replace(" WIB", "")}</td>
              <td>{detection.province}</td>
              <td className="mono">
                {detection.latitude.toFixed(2)}, {detection.longitude.toFixed(2)}
              </td>
              <td>{detection.confidence}</td>
              <td>{detection.satellite}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GuidanceCards({
  guidance,
  compact,
}: {
  guidance: GuidanceItem[];
  compact?: boolean;
}) {
  return (
    <>
      <ul className={compact ? "cards compact" : "cards"}>
        {guidance.map((item) => (
          <li key={item.id} className={item.tone}>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </li>
        ))}
      </ul>
      <p className="note">
        <span className="draft-badge">Teks contoh</span> Belum ditinjau tenaga kesehatan. Panduan
        ini bukan nasihat medis pribadi. Panduan yang terbit nanti mencantumkan sumber, peninjau,
        dan tanggal tinjauan.
      </p>
    </>
  );
}

export function PublicCopyArt({ variant }: { variant: number }) {
  const sky = variant % 2 ? "#e9d9b0" : "#d9cfbf";
  return (
    <svg viewBox="0 0 240 160" role="img" aria-label="Ilustrasi pengganti foto salinan publik">
      <rect width="240" height="160" fill={sky} />
      <circle cx="176" cy="46" r="18" fill="#f3b26a" opacity="0.7" />
      <rect y="70" width="240" height="40" fill="#cfc4b0" opacity="0.8" />
      <path
        d="M0 112 L18 92 L30 104 L46 84 L60 102 L78 88 L96 106 L112 90 L130 104 L150 86 L168 104 L188 92 L206 106 L224 90 L240 100 L240 160 L0 160Z"
        fill="#5f6b4e"
      />
      <path d="M0 160 L104 118 L136 118 L240 160Z" fill="#8a7a62" />
      <rect y="64" width="240" height="56" fill="#efe7da" opacity="0.45" />
      <text x="10" y="150" fill="#fffdf7" fontFamily="monospace" fontSize="10">
        SALINAN PUBLIK · CONTOH
      </text>
    </svg>
  );
}

export function ReportCard({ report, index }: { report: FieldReport; index: number }) {
  return (
    <article className="report">
      <figure>
        <PublicCopyArt variant={index} />
        <figcaption>{report.publicCopy}</figcaption>
      </figure>
      <div>
        <p className="reviewed">
          <span aria-hidden="true">■</span> Sudah ditinjau
        </p>
        <h3>{report.title}</h3>
        <blockquote>
          <p>{report.testimony}</p>
        </blockquote>
        <dl className="trail">
          <div>
            <dt>Lokasi</dt>
            <dd>
              {report.area}, {report.province} (perkiraan)
            </dd>
          </div>
          <div>
            <dt>Diamati</dt>
            <dd>{formatWib(report.observedAt)}</dd>
          </div>
          <div>
            <dt>Diterbitkan</dt>
            <dd>
              {formatWib(report.publishedAt)} · {report.reviewer}
            </dd>
          </div>
          <div>
            <dt>Riwayat</dt>
            <dd>{report.revision}</dd>
          </div>
          <div>
            <dt>Penggunaan ulang</dt>
            <dd>{report.reuse}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}

export function Limits() {
  return (
    <div className="split">
      <div>
        <h3>Yang tidak bisa ditunjukkan data ini</h3>
        <ul>
          <li>Deteksi satelit menandai panas di permukaan. Deteksi belum tentu kebakaran.</li>
          <li>Satu kebakaran dapat tampil sebagai beberapa deteksi.</li>
          <li>Awan dan asap tebal dapat menutupi api. Tidak ada deteksi bukan berarti aman.</li>
          <li>Data ini tidak menunjukkan siapa yang menyebabkan kebakaran.</li>
          <li>Satelit lewat beberapa kali sehari. Ini bukan pemantauan terus-menerus.</li>
        </ul>
      </div>
      <div>
        <h3>Yang kami tampilkan</h3>
        <ul>
          <li>Waktu pengamatan satelit, dalam WIB.</li>
          <li>Produk data, satelit, dan tingkat keyakinan.</li>
          <li>Waktu pembaruan terakhir yang berhasil.</li>
          <li>Laporan lapangan hanya setelah ditinjau dan disetujui.</li>
        </ul>
      </div>
    </div>
  );
}

export function StatusList() {
  return (
    <dl className="status-list">
      <div>
        <dt>Peta deteksi</dt>
        <dd>Contoh dengan data sintetis. Belum tersambung ke sumber data satelit.</dd>
      </div>
      <div>
        <dt>Laporan lapangan</dt>
        <dd>
          Belum menerima kiriman. Belum ada formulir laporan atau proses tinjauan. Laporan di
          halaman ini adalah contoh.
        </dd>
      </div>
      <div>
        <dt>Panduan</dt>
        <dd>Teks contoh untuk warga. Panduan untuk pemda dan pemerintah pusat direncanakan.</dd>
      </div>
      <div>
        <dt>Akun</dt>
        <dd>Tidak ada pendaftaran atau masuk akun untuk pembaca.</dd>
      </div>
    </dl>
  );
}

export function Footer() {
  return (
    <footer className="ka-footer">
      <p>
        Kawal Asap · kawal.id. Rancangan visual dengan data sintetis. Bukan layanan peringatan
        kebakaran.
      </p>
      <p>Peta dasar: Natural Earth (domain publik). Bahasa visual terinspirasi dari Cukup.</p>
    </footer>
  );
}

export type { Detection, FieldReport };
