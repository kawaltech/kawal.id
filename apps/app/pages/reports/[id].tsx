import type { InferProps } from "void";

import { DecisionForm, DiscardForm, DraftForm } from "../../components/forms.tsx";
import { RevisionFacts, Section, StateBadge, Timeline } from "../../components/workspace.tsx";
import { formatWib, isoToWibInput } from "../../lib/report-model.ts";
import type { loader } from "./[id].server";

export default function Report({ report }: InferProps<typeof loader>) {
  const { shown } = report;
  const lastReview = report.reviews.at(-1);
  return (
    <main id="isi" tabIndex={-1}>
      <section className="hero" aria-labelledby="judul">
        <p className="eyebrow">
          <a href="/reports">Laporan</a> · revisi {shown.number}
        </p>
        <h1 id="judul">{shown.title}</h1>
        <p className="meta-row">
          <StateBadge state={report.state} />
          <span>Penulis: {report.mine ? "Anda" : report.authorName}</span>
          <span>Dibuat {formatWib(report.createdAt)}</span>
          <span>Diperbarui {formatWib(report.updatedAt)}</span>
        </p>
      </section>

      {report.changesRequested ? (
        <div className="callout changes" role="status">
          <p>
            <strong>{report.changesRequested.reviewerName} meminta perubahan</strong> pada revisi{" "}
            {report.changesRequested.revisionNumber}. Revisi {shown.number} adalah salinannya.
            Perbaiki, lalu kirim lagi.
          </p>
          <blockquote>{report.changesRequested.note}</blockquote>
        </div>
      ) : null}
      {report.state === "in_review" && report.mine ? (
        <div className="callout info" role="status">
          <p>
            <strong>Menunggu peninjau.</strong> Anggota tim lain akan memutuskan. Anda tidak dapat
            meninjau laporan Anda sendiri.
          </p>
        </div>
      ) : null}
      {report.state === "approved" && lastReview ? (
        <div className="callout info" role="status">
          <p>
            <strong>
              Disetujui oleh {lastReview.reviewerIsViewer ? "Anda" : lastReview.reviewerName}
            </strong>{" "}
            pada {formatWib(lastReview.decidedAt)}. Laporan ini tetap privat. Penerbitan belum
            tersedia.
          </p>
        </div>
      ) : null}
      {report.state === "rejected" && lastReview ? (
        <div className="callout changes" role="status">
          <p>
            <strong>
              Ditolak oleh {lastReview.reviewerIsViewer ? "Anda" : lastReview.reviewerName}
            </strong>{" "}
            pada {formatWib(lastReview.decidedAt)}.
          </p>
          <blockquote>{lastReview.note}</blockquote>
        </div>
      ) : null}
      {report.metadataOnly ? (
        <div className="callout info" role="status">
          <p>
            <strong>Draf ini belum pernah dikirim.</strong> Sebagai admin, Anda hanya melihat judul
            dan waktunya. Anda dapat membuang draf ini jika penulisnya tidak lagi aktif.
          </p>
        </div>
      ) : null}

      <div className="two-col">
        <div style={{ display: "grid", gap: "1.5rem" }}>
          {report.can.edit ? (
            <Section id="ubah" eyebrow={`Revisi ${shown.number} · belum dikirim`} title="Ubah draf">
              <div className="privacy-note">
                <p>
                  <strong>Jangan tulis data pribadi.</strong> Tidak boleh ada nama, nomor telepon,
                  alamat rumah, atau koordinat pelapor.
                </p>
              </div>
              <DraftForm
                key={report.version}
                reportId={report.id}
                version={report.version}
                initial={{
                  title: shown.title,
                  account: shown.account ?? "",
                  observedAtWib: isoToWibInput(shown.observedAt),
                  province: shown.province ?? "",
                  area: shown.area ?? "",
                  sourceChannel: shown.sourceChannel ?? "",
                }}
              />
            </Section>
          ) : report.metadataOnly ? null : (
            <Section
              id="isi-laporan"
              eyebrow={`Revisi ${shown.number}${shown.submittedAt ? " · terkunci" : ""}`}
              title="Isi laporan"
            >
              <p className="account">{shown.account ?? "—"}</p>
              <RevisionFacts revision={shown} />
            </Section>
          )}

          {report.can.review ? (
            <Section id="tinjau" eyebrow="Tinjauan" title="Keputusan Anda">
              <p className="small muted">
                Baca isi laporan di atas. Keputusan berlaku untuk revisi {shown.number} saja.
              </p>
              <DecisionForm
                key={report.version}
                reportId={report.id}
                version={report.version}
                revisionId={shown.id}
                revisionNumber={shown.number}
              />
            </Section>
          ) : null}
        </div>

        <div style={{ display: "grid", gap: "1.5rem" }}>
          <Section id="riwayat" eyebrow="Catatan audit" title="Riwayat">
            <Timeline events={report.events} reviews={report.reviews} />
          </Section>
          {report.can.discard ? (
            <DiscardForm key={report.version} reportId={report.id} version={report.version} />
          ) : null}
        </div>
      </div>
    </main>
  );
}
