import { DraftForm } from "../../components/forms.tsx";

export default function NewReport() {
  return (
    <main id="isi" tabIndex={-1}>
      <section className="hero" aria-labelledby="judul">
        <p className="eyebrow">Laporan baru · draf privat</p>
        <h1 id="judul">Catat laporan lapangan</h1>
        <p className="lead">
          Mulai dengan judul. Lengkapi bagian lain sebelum Anda mengirim draf untuk ditinjau.
        </p>
      </section>
      <section aria-label="Isi laporan">
        <div className="privacy-note">
          <p>
            <strong>Jangan tulis data pribadi.</strong> Tidak boleh ada nama, nomor telepon, alamat
            rumah, atau koordinat pelapor. Belum ada aturan persetujuan untuk data itu.
          </p>
        </div>
        <DraftForm
          initial={{
            title: "",
            account: "",
            observedAtWib: "",
            province: "",
            area: "",
            sourceChannel: "",
          }}
        />
      </section>
    </main>
  );
}
