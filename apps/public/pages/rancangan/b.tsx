import { useState } from "react";
import type { InferProps } from "void";

import { formatDay, formatWibTime, wibDay } from "~/design/fixture";
import {
  DetectionTable,
  FeedNotice,
  Filters,
  Footer,
  FreshnessPill,
  GuidanceCards,
  HotspotMap,
  Limits,
  MapLegend,
  Masthead,
  ProvinceTable,
  ReviewBar,
  SkipLink,
  StatusList,
  provinceCounts,
  useDesignState,
  type MapView,
} from "~/design/ui";

import type { loader } from "./b.server";

export default function OptionB(loaderData: InferProps<typeof loader>) {
  const view = useDesignState(loaderData);
  const [mapView, setMapView] = useState<MapView>("pilot");
  const unavailable = view.detections === null;
  const provinces = view.detections ? provinceCounts(view.detections).length : null;
  return (
    <div className="ka ka-b" lang="id">
      <SkipLink />
      <ReviewBar option="B · Peta dan tabel" state={view.state} setState={view.setState} />
      <Masthead
        nav={[
          { href: "#peta", label: "Peta" },
          { href: "#cara-membaca", label: "Cara membaca" },
          { href: "#panduan", label: "Panduan" },
          { href: "#status", label: "Status" },
        ]}
      >
        <FreshnessPill feed={view.feed} />
      </Masthead>
      <main id="isi" tabIndex={-1}>
        <div className="tiles" aria-label="Ringkasan">
          <div className="tile">
            <p className="eyebrow">Deteksi satelit · {view.windowHours} jam</p>
            <p className="big-figure">{view.detections ? view.detections.length : "—"}</p>
            <p className="small muted">Bukan jumlah kebakaran</p>
          </div>
          <div className="tile">
            <p className="eyebrow">Provinsi dengan deteksi</p>
            <p className="big-figure">{provinces ?? "—"}</p>
            <p className="small muted">Dari data yang tersedia</p>
          </div>
          <div className="tile">
            <p className="eyebrow">Pembaruan berhasil</p>
            <p className="big-figure">
              {view.feed.lastSuccessAt ? formatWibTime(view.feed.lastSuccessAt) : "—"}
            </p>
            <p className="small muted">
              {view.feed.lastSuccessAt
                ? `${formatDay(wibDay(view.feed.lastSuccessAt))} · WIB`
                : "Belum pernah berhasil"}
            </p>
          </div>
          <div className="tile">
            <p className="eyebrow">Sumber</p>
            <p className="big-figure">VIIRS</p>
            <p className="small muted">NASA FIRMS (contoh)</p>
          </div>
        </div>

        <section id="peta" aria-labelledby="peta-judul">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Deteksi satelit</p>
              <h2 id="peta-judul">Peta dan tabel titik panas</h2>
            </div>
            <fieldset className="segmented" aria-label="Wilayah peta">
              <legend className="sr-only">Wilayah peta</legend>
              <button
                type="button"
                aria-pressed={mapView === "pilot"}
                onClick={() => setMapView("pilot")}
              >
                Sumatra dan Kalimantan
              </button>
              <button
                type="button"
                aria-pressed={mapView === "nasional"}
                onClick={() => setMapView("nasional")}
              >
                Seluruh Indonesia
              </button>
            </fieldset>
          </div>
          <FeedNotice feed={view.feed} />
          <Filters
            windowHours={view.windowHours}
            setWindowHours={view.setWindowHours}
            confidences={view.confidences}
            toggleConfidence={view.toggleConfidence}
            disabled={unavailable}
          />
          <div className="dash">
            <div>
              <MapLegend withReports={false} />
              <HotspotMap
                detections={view.detections}
                view={mapView}
                caption="Peta dasar: Natural Earth (domain publik). Peta dan tabel memakai filter yang sama."
              />
            </div>
            <div>
              <ProvinceTable detections={view.detections} />
              <details open>
                <summary>Semua deteksi</summary>
                <DetectionTable detections={view.detections} />
              </details>
            </div>
          </div>
        </section>

        <section id="cara-membaca" aria-labelledby="cara-judul">
          <p className="eyebrow">Metode</p>
          <h2 id="cara-judul">Bagaimana membaca data ini?</h2>
          <Limits />
        </section>

        <section id="panduan" aria-labelledby="panduan-judul">
          <p className="eyebrow">Panduan dan laporan</p>
          <h2 id="panduan-judul">Langkah singkat untuk warga</h2>
          <GuidanceCards guidance={loaderData.guidance} compact />
          <p className="note">
            Laporan lapangan akan ada di halaman sendiri. Halaman ini hanya memuat data satelit dan
            panduan. Waktu pembaruan terakhir menunjukkan umur data yang tersedia.
          </p>
        </section>

        <section id="status" aria-labelledby="status-judul">
          <p className="eyebrow">Status</p>
          <h2 id="status-judul">Apa yang tersedia sekarang?</h2>
          <StatusList />
        </section>
      </main>
      <Footer />
    </div>
  );
}
