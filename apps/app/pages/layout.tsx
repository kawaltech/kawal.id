import type { ReactNode } from "react";
import { Link, useShared } from "@void/react";

import "~/design/kawal.css";
import "../styles/workspace.css";
import type { Viewer } from "../lib/member.ts";

const ROLE_LABELS: Record<Viewer["role"], string> = { reviewer: "Peninjau", admin: "Admin" };

export default function Layout({ children }: { children: ReactNode }) {
  // Only protected pages have a viewer. Open pages (sign-in) have none.
  const viewer = useShared<{ viewer?: Viewer | null } | null>()?.viewer ?? null;
  return (
    <div className="ka ka-app" lang="id">
      <a className="skip-link" href="#isi">
        Langsung ke isi
      </a>
      <header className="ka-top">
        <a className="wordmark" href="/">
          <span className="wordmark-name">Kawal Asap</span>
          <span className="wordmark-tag">Ruang kerja</span>
        </a>
        {viewer ? (
          <>
            <nav aria-label="Ruang kerja">
              <ul>
                <li>
                  <Link href="/reports">Laporan</Link>
                </li>
                <li>
                  <Link href="/reports/new">Laporan baru</Link>
                </li>
                <li>
                  <a href="/sign-out">Keluar</a>
                </li>
              </ul>
            </nav>
            <p className="viewer">
              <span>{viewer.name}</span>
              <span className="role-tag">{ROLE_LABELS[viewer.role]}</span>
            </p>
          </>
        ) : null}
      </header>
      {viewer ? (
        <aside className="private-bar" aria-label="Status ruang kerja">
          <strong>Privat</strong>
          <p>
            Laporan di sini hanya terlihat oleh tim. Laporan yang disetujui tidak terbit di
            kawal.id. Penerbitan belum tersedia.
          </p>
        </aside>
      ) : null}
      {children}
      <footer className="ka-footer">
        <p>Kawal Asap · ruang kerja tim. Bukan layanan publik.</p>
        <p>Bahasa visual terinspirasi dari Cukup.</p>
      </footer>
    </div>
  );
}
