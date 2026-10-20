import { Link } from "@void/react";
import { TanyaPreview } from "../../components/tanya-preview";

export default function TanyaReview() {
  return (
    <div className="ka tanya-review" lang="id">
      <main id="isi">
        <p className="eyebrow">Tinjauan lokal · Data sintetis</p>
        <h1>Tanya Kawal Asap</h1>
        <p>
          Usulan integrasi, belum diaktifkan. Halaman ini tidak memuat layanan Tulis, tidak menerima
          pertanyaan, dan tidak menyediakan login.
        </p>
        <p>
          <Link href="/">Kembali ke peta dan tabel</Link>
        </p>
        {import.meta.env.DEV ? (
          <TanyaPreview />
        ) : (
          <p>Pratinjau interaksi hanya tersedia di server pengembangan lokal.</p>
        )}
      </main>
    </div>
  );
}
