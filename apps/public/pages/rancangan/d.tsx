import { Link } from "@void/react";

import { IncidentWorkspace } from "~/design/incident";
import { Masthead, SkipLink } from "~/design/ui";

export default function OptionD() {
  return (
    <div className="ka ka-d" lang="id">
      <SkipLink />
      <aside className="review-bar" aria-label="Kontrol tinjauan desain" lang="en">
        <p>
          <strong>Design review · 3D prototype</strong>{" "}
          <span>
            Synthetic data and a fictional place. Not a fire information service. See ADR 0009.
          </span>{" "}
          <Link href="/rancangan/d/indonesia">Indonesia map (local seed)</Link> ·{" "}
          <Link href="/rancangan">All options</Link>
        </p>
      </aside>
      <Masthead
        nav={[
          { href: "#peta", label: "Peta" },
          { href: "#grafik", label: "Grafik" },
          { href: "#tabel", label: "Tabel" },
          { href: "#metode", label: "Cara membaca" },
          { href: "/rancangan/d/indonesia", label: "Peta Indonesia" },
        ]}
      />
      <main id="isi" tabIndex={-1}>
        <IncidentWorkspace />
      </main>
      <footer className="ka-footer">
        <p>
          Kawal Asap · kawal.id. Prototipe 3D dengan data sintetis dan lokasi fiktif. Bukan layanan
          peringatan kebakaran.
        </p>
        <p>Medan dan peta digambar di peramban. Mesin 3D: three.js (MIT).</p>
      </footer>
    </div>
  );
}
