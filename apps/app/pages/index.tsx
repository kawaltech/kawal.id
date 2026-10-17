import type { InferProps } from "void";

import type { loader } from "./index.server";

export default function Home({ counts }: InferProps<typeof loader>) {
  const tiles = [
    {
      label: "Perlu tinjauan Anda",
      value: counts.toReview,
      note: "Laporan anggota lain",
      attention: counts.toReview > 0,
    },
    { label: "Draf Anda", value: counts.myDrafts, note: "Belum dikirim" },
    { label: "Menunggu peninjau", value: counts.myInReview, note: "Laporan Anda" },
    { label: "Disetujui", value: counts.approved, note: "Tetap privat" },
  ];
  return (
    <main id="isi" tabIndex={-1}>
      <section className="hero" aria-labelledby="judul">
        <p className="eyebrow">Ruang kerja tim · laporan lapangan</p>
        <h1 id="judul">Laporan ditinjau sebelum dipercaya</h1>
        <p className="lead">
          Catat laporan warga sebagai draf privat. Anggota tim lain meninjau setiap revisi. Belum
          ada laporan yang terbit ke publik.
        </p>
        <p className="actions">
          <a className="button primary" href="/reports/new">
            Buat laporan baru
          </a>
          <a className="button" href="/reports">
            Lihat semua laporan
          </a>
        </p>
      </section>

      <div className="tiles" aria-label="Ringkasan">
        {tiles.map((tile) => (
          <a
            key={tile.label}
            className={tile.attention ? "tile attention" : "tile"}
            href="/reports"
          >
            <span className="eyebrow">{tile.label}</span>
            <span className="big-figure">{tile.value}</span>
            <span className="small muted">{tile.note}</span>
          </a>
        ))}
      </div>

      <section aria-labelledby="cara-judul">
        <p className="eyebrow">Alur tinjauan</p>
        <h2 id="cara-judul">Dua orang untuk setiap laporan</h2>
        <ol className="cards">
          <li className="sky">
            <h3>1 · Tulis draf</h3>
            <p>
              Penulis mencatat apa yang diamati, kapan, dan di wilayah mana. Draf hanya terlihat
              oleh penulis.
            </p>
          </li>
          <li className="mint">
            <h3>2 · Kirim untuk ditinjau</h3>
            <p>Revisi yang dikirim terkunci. Peninjau membaca revisi yang sama persis.</p>
          </li>
          <li className="rose">
            <h3>3 · Anggota lain memutuskan</h3>
            <p>
              Setujui, minta perubahan, atau tolak. Tidak ada yang dapat meninjau laporannya
              sendiri.
            </p>
          </li>
        </ol>
      </section>

      <section aria-labelledby="status-judul">
        <p className="eyebrow">Status</p>
        <h2 id="status-judul">Yang belum tersedia</h2>
        <dl className="status-list">
          <div>
            <dt>Penerbitan</dt>
            <dd>
              Laporan yang disetujui tidak tampil di kawal.id. Penerbitan dan penarikan belum
              dirancang.
            </dd>
          </div>
          <div>
            <dt>Foto dan lampiran</dt>
            <dd>Belum ada unggahan. Aturan persetujuan dan penyimpanan belum ditetapkan.</dd>
          </div>
          <div>
            <dt>Data pelapor</dt>
            <dd>Jangan simpan nama, nomor telepon, atau alamat pelapor di laporan.</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
