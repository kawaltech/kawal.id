import styles from "~/design/kawal.css?url";
import { designFixture } from "~/design/fixture";
import {
  DetectionFigure,
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
  ReportCard,
  ReviewBar,
  SkipLink,
  StatusList,
  useDesignState,
} from "~/design/ui";

import type { Route } from "./+types/a";

export const links: Route.LinksFunction = () => [{ rel: "stylesheet", href: styles }];

export function meta() {
  return [
    { title: "Rancangan A: Warga dulu · Kawal Asap" },
    { name: "robots", content: "noindex" },
  ];
}

export function loader() {
  return designFixture();
}

export default function OptionA({ loaderData }: Route.ComponentProps) {
  const view = useDesignState(loaderData);
  const unavailable = view.detections === null;
  return (
    <div className="ka ka-a" lang="id">
      <SkipLink />
      <ReviewBar option="A · Warga dulu" state={view.state} setState={view.setState} />
      <Masthead
        nav={[
          { href: "#panduan", label: "Panduan" },
          { href: "#peta", label: "Peta deteksi" },
          { href: "#laporan", label: "Laporan" },
          { href: "#status", label: "Status" },
        ]}
      />
      <main id="isi" tabIndex={-1}>
        <section className="hero" aria-labelledby="judul">
          <p className="eyebrow">Kawal Asap · informasi kabut asap yang sudah ditinjau</p>
          <h1 id="judul">
            Asap datang lagi.
            <br />
            Lindungi diri dan keluarga hari ini.
          </h1>
          <p className="lead">
            Kawal Asap mengumpulkan panduan, data satelit, dan laporan warga. Tim peninjau
            memeriksa setiap isi sebelum terbit, dan setiap angka menyebutkan sumbernya.
          </p>
          <FreshnessPill feed={view.feed} />
          <p className="actions">
            <a className="button primary" href="#panduan">
              Baca panduan
            </a>
            <a href="#peta">Lihat peta deteksi</a>
          </p>
        </section>

        <section id="panduan" aria-labelledby="panduan-judul">
          <p className="eyebrow">Untuk warga di daerah berasap</p>
          <h2 id="panduan-judul">Apa yang bisa saya lakukan sekarang?</h2>
          <GuidanceCards guidance={loaderData.guidance} />
        </section>

        <section id="peta" aria-labelledby="peta-judul">
          <p className="eyebrow">Deteksi satelit · Sumatra dan Kalimantan</p>
          <h2 id="peta-judul">Di mana satelit mendeteksi titik panas?</h2>
          <FeedNotice feed={view.feed} />
          <DetectionFigure
            detections={view.detections}
            feed={view.feed}
            windowHours={view.windowHours}
          />
          <Filters
            windowHours={view.windowHours}
            setWindowHours={view.setWindowHours}
            confidences={view.confidences}
            toggleConfidence={view.toggleConfidence}
            disabled={unavailable}
          />
          <MapLegend />
          <HotspotMap detections={view.detections} reports={loaderData.reports} view="pilot" />
          <p className="small muted">
            Sumber: {view.feed.source}. Produk: {view.feed.product}. Semua waktu dalam WIB.
          </p>
          <details>
            <summary>Lihat data sebagai tabel</summary>
            <DetectionTable detections={view.detections} />
          </details>
          <details>
            <summary>Cara membaca peta ini</summary>
            <Limits />
          </details>
        </section>

        <section id="laporan" aria-labelledby="laporan-judul">
          <p className="eyebrow">Laporan lapangan · sudah ditinjau</p>
          <h2 id="laporan-judul">Apa yang dilihat warga?</h2>
          <p className="prose muted">
            Tim peninjau memeriksa laporan sebelum terbit. Foto publik adalah salinan yang sudah
            disamarkan. Berkas asli tetap tertutup.
          </p>
          <ReportCard report={loaderData.reports[0]} index={0} />
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
