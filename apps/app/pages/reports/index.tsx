import { Link } from "@void/react";
import type { InferProps } from "void";

import { Section, StateBadge } from "../../components/workspace.tsx";
import { formatWib } from "../../lib/report-model.ts";
import type { ReportSummary } from "../../lib/report-store.ts";
import type { loader } from "./index.server";

function ReportTable({ reports, empty }: { reports: ReportSummary[]; empty: string }) {
  if (reports.length === 0) return <p className="empty">{empty}</p>;
  return (
    <div className="table-scroll">
      <table className="report-table">
        <thead>
          <tr>
            <th scope="col">Laporan</th>
            <th scope="col">Wilayah</th>
            <th scope="col">Diamati</th>
            <th scope="col">Penulis</th>
            <th scope="col">Diperbarui</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => (
            <tr key={report.id}>
              <td>
                <Link href={`/reports/${report.id}`}>{report.title}</Link>
                <br />
                <StateBadge state={report.state} />{" "}
                <span className="small muted">rev. {report.revisionNumber}</span>
              </td>
              <td>{report.province ? `${report.area ?? "—"}, ${report.province}` : "—"}</td>
              <td className="when">{formatWib(report.observedAt)}</td>
              <td>{report.mine ? "Anda" : report.authorName}</td>
              <td className="when">{formatWib(report.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Reports({ reports }: InferProps<typeof loader>) {
  const toReview = reports.filter((r) => r.state === "in_review" && !r.mine);
  const myDrafts = reports.filter((r) => r.state === "draft" && r.mine);
  const myInReview = reports.filter((r) => r.state === "in_review" && r.mine);
  const otherDrafts = reports.filter((r) => r.state === "draft" && !r.mine);
  const closed = reports.filter(
    (r) => r.state === "approved" || r.state === "rejected" || r.state === "discarded",
  );
  return (
    <main id="isi" tabIndex={-1}>
      <section className="hero" aria-labelledby="judul">
        <div className="page-head">
          <div>
            <p className="eyebrow">Laporan lapangan · privat</p>
            <h1 id="judul">Laporan</h1>
            <p className="lead">
              Draf Anda, laporan yang perlu ditinjau, dan keputusan tim. Urut dari perubahan
              terbaru.
            </p>
          </div>
          <a className="button primary" href="/reports/new">
            Buat laporan baru
          </a>
        </div>
      </section>

      <Section id="tinjau" eyebrow="Giliran Anda" title="Perlu tinjauan Anda">
        <ReportTable
          reports={toReview}
          empty="Tidak ada laporan anggota lain yang menunggu tinjauan."
        />
      </Section>
      <Section id="draf" eyebrow="Belum dikirim" title="Draf Anda">
        <ReportTable reports={myDrafts} empty="Anda belum punya draf." />
      </Section>
      <Section id="menunggu" eyebrow="Sudah dikirim" title="Laporan Anda dalam tinjauan">
        <ReportTable reports={myInReview} empty="Tidak ada laporan Anda yang menunggu peninjau." />
      </Section>
      {otherDrafts.length > 0 ? (
        <Section id="draf-lain" eyebrow="Sedang diperbaiki" title="Draf anggota lain">
          <ReportTable reports={otherDrafts} empty="" />
        </Section>
      ) : null}
      <Section id="selesai" eyebrow="Keputusan akhir" title="Selesai">
        <ReportTable reports={closed} empty="Belum ada laporan yang selesai." />
      </Section>
    </main>
  );
}
