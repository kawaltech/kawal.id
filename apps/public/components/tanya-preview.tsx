import { useId, useRef, useState } from "react";
import "./tanya-preview.css";

const tabs = ["Tanya", "Cara kerja", "Riwayat"];

export function TanyaPreview() {
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const tabList = useRef<HTMLDivElement>(null);
  const id = useId();
  const [tab, setTab] = useState(0);
  const [open, setOpen] = useState(false);

  return (
    <>
      <p className="note">
        Simulasi lokal saja. Tombol membuka contoh panel, bukan layanan aktif. Peta dan tabel tidak
        memerlukan panel ini.
      </p>
      <button
        ref={launcher}
        type="button"
        className="tanya-launcher"
        aria-haspopup="dialog"
        aria-controls={`${id}-dialog`}
        aria-expanded={open}
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
        }}
      >
        Tanya Kawal Asap <span className="small">· Contoh lokal</span>
      </button>
      <dialog
        ref={dialog}
        id={`${id}-dialog`}
        className="tanya-panel"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-notice`}
        onClose={() => {
          setOpen(false);
          launcher.current?.focus();
        }}
      >
        <header className="tanya-heading">
          <h2 id={`${id}-title`}>Tanya Kawal Asap</h2>
          <button type="button" onClick={() => dialog.current?.close()}>
            Tutup
          </button>
        </header>
        <p id={`${id}-notice`} className="note">
          Contoh lokal · Bukan layanan darurat. Jawaban dapat keliru. Periksa sumber resmi.
        </p>
        <div ref={tabList} role="tablist" aria-label="Isi panel" className="tanya-tabs">
          {tabs.map((name, index) => (
            <button
              key={name}
              type="button"
              role="tab"
              id={`${id}-tab-${index}`}
              aria-controls={`${id}-content`}
              aria-selected={tab === index}
              tabIndex={tab === index ? 0 : -1}
              onClick={() => setTab(index)}
              onKeyDown={(event) => {
                let next = index;
                if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
                else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = tabs.length - 1;
                else return;
                event.preventDefault();
                setTab(next);
                tabList.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
              }}
            >
              {name}
            </button>
          ))}
        </div>
        <section
          role="tabpanel"
          id={`${id}-content`}
          aria-labelledby={`${id}-tab-${tab}`}
          tabIndex={0}
          className="tanya-content"
        >
          {tab === 0 && (
            <>
              <h3>Sebelum bertanya</h3>
              <p>
                Menurut usulan Tulis, pertanyaan dan jawaban akan masuk riwayat publik. Tanpa nama
                atau email bukan berarti anonim: isi pertanyaan dapat mengungkap identitas.
              </p>
              <p>
                Jangan kirim data pribadi, lokasi pribadi, atau laporan yang belum diterbitkan.
                Kebijakan privasi, persetujuan publikasi, dan penghapusan belum disepakati.
              </p>
              <p className="note">
                Login dan pengiriman pertanyaan dinonaktifkan dalam contoh ini.
              </p>
            </>
          )}
          {tab === 1 && (
            <>
              <h3>Belum ada proses agent</h3>
              <p>
                Panel ini hanya simulasi lokal. Tidak ada koneksi ke Tulis, Google, atau sumber data
                langsung. Kutipan, ketepatan jawaban, batas topik, dan kuota belum diuji.
              </p>
            </>
          )}
          {tab === 2 && (
            <>
              <h3>Contoh riwayat sintetis</h3>
              <p className="eyebrow">Bukan pertanyaan pengguna</p>
              <h4>Apa arti deteksi satelit?</h4>
              <p>
                Deteksi satelit adalah pengamatan termal dari produk data satelit, bukan kebakaran
                terkonfirmasi. Ini teks contoh lokal, bukan jawaban Tulis.
              </p>
              <p>Riwayat layanan belum dimuat. Pemisahan riwayat antarportal belum diuji.</p>
            </>
          )}
        </section>
      </dialog>
    </>
  );
}
