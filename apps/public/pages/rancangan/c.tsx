import type { InferProps } from "void";
import {
  CONFIDENCES,
  formatDay,
  visibleDetections,
  wibDay,
  wibHour,
  type FeedStatus,
} from "~/design/fixture";
import {
  FeedNotice,
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
  provinceCounts,
  useDesignState,
  type Detection,
  type FieldReport,
} from "~/design/ui";

import type { loader } from "./c.server";

const DAYS = ["2026-10-16", "2026-10-15", "2026-10-14"];
const WIDTH = 600;
const x = (hour: number) => 20 + (hour / 24) * (WIDTH - 40);

function DayStrip({
  day,
  detections,
  reports,
  feed,
}: {
  day: string;
  detections: Detection[] | null;
  reports: FieldReport[];
  feed: FeedStatus;
}) {
  const stacks = new Map<number, number>();
  const lastDay = feed.lastSuccessAt ? wibDay(feed.lastSuccessAt) : null;
  let gapFrom: number | null = null;
  if (!feed.lastSuccessAt) gapFrom = 0;
  else if (lastDay === day) gapFrom = wibHour(feed.lastSuccessAt);
  else if (lastDay && lastDay < day) gapFrom = 0;
  const label = detections
    ? `Waktu deteksi satelit pada ${formatDay(day)}: ${detections.length} deteksi.`
    : `Data deteksi pada ${formatDay(day)} tidak tersedia.`;
  return (
    <div className="strip">
      <svg viewBox={`0 0 ${WIDTH} 86`} role="img" aria-label={label}>
        <defs>
          <pattern id={`arsir-${day}`} width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M0 6 L6 0" stroke="currentColor" strokeWidth="1" opacity="0.45" />
          </pattern>
        </defs>
        {gapFrom !== null && (
          <rect
            className="strip-gap"
            fill={`url(#arsir-${day})`}
            x={x(gapFrom)} y="6" width={x(24) - x(gapFrom)} height="52" />
        )}
        <line className="strip-axis" x1={x(0)} x2={x(24)} y1="58" y2="58" />
        {[0, 6, 12, 18, 24].map((hour) => (
          <g key={hour}>
            <line x1={x(hour)} x2={x(hour)} y1="58" y2="63" className="strip-axis" />
            <text className="strip-label" x={x(hour)} y="76" textAnchor="middle">
              {String(hour).padStart(2, "0")}.00
            </text>
          </g>
        ))}
        {detections?.map((detection) => {
          const hour = wibHour(detection.acquiredAt);
          const bucket = Math.round(hour * 4);
          const level = stacks.get(bucket) ?? 0;
          stacks.set(bucket, level + 1);
          return (
            <circle
              key={detection.id}
              className="strip-tick"
              cx={x(hour)}
              cy={53 - level * 3.6}
              r="2.8"
            />
          );
        })}
        {reports.map((report) => (
          <rect
            key={report.id}
            className="strip-report"
            x={x(wibHour(report.observedAt)) - 5}
            y="20"
            width="10"
            height="10"
            rx="1.5"
          />
        ))}
        {gapFrom !== null && (
          <text
            className="strip-label"
            x={Math.min(x(gapFrom) + 6, x(24) - 170)}
            y="18"
          >
            {feed.lastSuccessAt ? "setelah pembaruan terakhir" : "data tidak tersedia"}
          </text>
        )}
      </svg>
    </div>
  );
}

export default function OptionC(loaderData: InferProps<typeof loader>) {
  const view = useDesignState(loaderData);
  const all = visibleDetections(loaderData, view.state, 72, CONFIDENCES);
  return (
    <div className="ka ka-c" lang="id">
      <SkipLink />
      <ReviewBar option="C · Catatan harian" state={view.state} setState={view.setState} />
      <Masthead
        nav={[
          { href: "#catatan", label: "Catatan harian" },
          { href: "#panduan", label: "Panduan" },
          { href: "#media", label: "For media" },
          { href: "#status", label: "Status" },
        ]}
      />
      <main id="isi" tabIndex={-1}>
        <section className="hero" aria-labelledby="judul">
          <div className="overview">
            <div>
              <p className="eyebrow">Catatan kabut asap · {formatDay(DAYS[0], true)}</p>
              <h1 id="judul">Catatan harian yang bisa dilacak sumbernya.</h1>
              <p className="lead">
                Setiap hari kami mencatat deteksi satelit dan laporan warga yang sudah ditinjau.
                Setiap catatan menyebutkan waktu, sumber, dan riwayat perubahannya.
              </p>
              <FreshnessPill feed={view.feed} />
            </div>
            <div>
              <HotspotMap
                detections={all}
                reports={loaderData.reports}
                view="pilot"
                caption="72 jam terakhir. Peta dasar: Natural Earth (domain publik)."
              />
            </div>
          </div>
        </section>

        <section id="catatan" aria-labelledby="catatan-judul">
          <p className="eyebrow">Catatan harian · 72 jam</p>
          <h2 id="catatan-judul">Apa yang tercatat setiap hari?</h2>
          <FeedNotice feed={view.feed} />
          <MapLegend />
          <p className="small muted">
            Garis waktu menunjukkan kapan satelit lewat dan mendeteksi panas. Deteksi berkumpul
            pada jam lintasan satelit. Ini bukan pemantauan terus-menerus.
          </p>
          <div className="ledger-day">
            {DAYS.map((day) => {
              const lastDay = view.feed.lastSuccessAt ? wibDay(view.feed.lastSuccessAt) : null;
              // A day after the last successful update has unknown detections, not zero.
              const detections =
                all && lastDay && lastDay >= day
                  ? all.filter((item) => wibDay(item.acquiredAt) === day)
                  : null;
              const reports = loaderData.reports.filter(
                (report) => wibDay(report.observedAt) === day,
              );
              return (
                <article key={day} className="ledger-day" aria-labelledby={`hari-${day}`}>
                  <div className="day-head">
                    <h3 id={`hari-${day}`}>{formatDay(day, true)}</h3>
                    <p className="mono small muted">
                      {detections ? `${detections.length} deteksi satelit` : "Deteksi: belum ada data"}{" "}
                      · {reports.length} laporan ditinjau
                    </p>
                  </div>
                  <DayStrip day={day} detections={detections} reports={reports} feed={view.feed} />
                  {detections && detections.length > 0 && (
                    <ul className="province-counts" aria-label="Deteksi per provinsi, urut abjad">
                      {provinceCounts(detections).map(([province, count]) => (
                        <li key={province}>
                          {province} <strong>{count}</strong>
                        </li>
                      ))}
                    </ul>
                  )}
                  {reports.map((report) => (
                    <ReportCard
                      key={report.id}
                      report={report}
                      index={loaderData.reports.indexOf(report)}
                    />
                  ))}
                </article>
              );
            })}
          </div>
          <details>
            <summary>Cara membaca catatan ini</summary>
            <Limits />
          </details>
        </section>

        <section id="panduan" aria-labelledby="panduan-judul">
          <p className="eyebrow">Untuk warga</p>
          <h2 id="panduan-judul">Apa yang bisa saya lakukan sekarang?</h2>
          <GuidanceCards guidance={loaderData.guidance} compact />
        </section>

        <section id="media" aria-labelledby="media-judul" lang="en">
          <p className="eyebrow">Media briefing · English</p>
          <h2 id="media-judul">For journalists and foreign media</h2>
          <div className="briefing">
            <h3>What this record shows</h3>
            <p>
              Each day has satellite detections and reviewed field reports. A satellite detection
              is a heat signal. It is not a confirmed fire. One fire can make many detections.
            </p>
            <p>
              Each report shows its observation time, review, and reuse terms. Use the canonical
              link to cite a report. We can correct or withdraw a report. Check the link before you
              publish.
            </p>
          </div>
          <p className="note">Sample text for review. The media briefing is not available yet.</p>
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
