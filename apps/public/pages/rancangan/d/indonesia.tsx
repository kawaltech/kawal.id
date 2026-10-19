import { Link } from "@void/react";

import { IndonesiaSeedWorkspace } from "~/design/indonesia";
import { Masthead, SkipLink } from "~/design/ui";

export default function OptionDIndonesia() {
  return (
    <div className="ka ka-d" lang="id">
      <SkipLink />
      <aside className="review-bar" aria-label="Kontrol tinjauan desain" lang="en">
        <p>
          <strong>Design review · local seed preview</strong>{" "}
          <span>
            Real FIRMS detections and Copernicus GLO-90 heights from .data/seed, served only by the
            local development server. Not a fire information service. See ADR 0009.
          </span>{" "}
          <Link href="/rancangan/d">Option D</Link> · <Link href="/rancangan">All options</Link>
        </p>
      </aside>
      <Masthead
        nav={[
          { href: "#ringkasan", label: "Ringkasan" },
          { href: "#peta", label: "Peta" },
          { href: "#tabel", label: "Tabel" },
          { href: "#metode", label: "Cara membaca" },
        ]}
      />
      <main id="isi" tabIndex={-1}>
        <IndonesiaSeedWorkspace />
      </main>
      <footer className="ka-footer">
        <p>
          Kawal Asap · kawal.id. Pratinjau lokal dengan data seed. Bukan layanan peringatan
          kebakaran.
        </p>
        <p>Medan dan peta digambar di peramban dari berkas lokal. Mesin 3D: three.js (MIT).</p>
      </footer>
    </div>
  );
}
