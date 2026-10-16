import { Link } from "@void/react";

const OPTIONS = [
  {
    letter: "A",
    path: "/rancangan/a",
    name: "Warga dulu (Residents first)",
    summary:
      "One narrow column. Resident guidance comes first, then the detection map, one reviewed field report, and the current status.",
    fit: "Use this option if the first users are residents in a haze area who read on a phone.",
    cache:
      "The page contains a field report. It must use the 60-second report cache policy, with no stale copy during an outage.",
  },
  {
    letter: "B",
    path: "/rancangan/b",
    name: "Peta dan tabel (Map and table)",
    summary:
      "A wide dashboard. Summary tiles, a map next to its table, and filters for time and confidence. Guidance is short. Field reports go to a separate page.",
    fit: "Use this option if the first users are journalists, analysts, or local government staff.",
    cache:
      "The page has only detections and guidance. Keep the last valid export and its update time. The Void deployment does not provide a 24-hour stale-on-error guarantee.",
  },
  {
    letter: "C",
    path: "/rancangan/c",
    name: "Catatan harian (Daily record)",
    summary:
      "A dated record for each day. A 24-hour strip shows when satellites detected heat. Reviewed reports show their full evidence trail. A short English media briefing is included.",
    fit: "Use this option if accountability and media reuse are the first goals.",
    cache:
      "The page contains field reports. It must use the 60-second report cache policy. Older days can move to separate pages later.",
  },
];

export default function DesignIndex() {
  return (
    <div className="ka ka-a" lang="en">
      <header className="ka-top">
        <p className="wordmark">
          <span className="wordmark-name">Kawal Asap</span>
          <span className="wordmark-tag">Design review</span>
        </p>
      </header>
      <main>
        <section className="hero">
          <p className="eyebrow">Initial visual options · 16 October 2026</p>
          <h1>Three directions for the public page</h1>
          <p className="panel-notice usang">
            <strong>Decision:</strong> The user selected option B, map and table. Options A and C
            stay here for reference.
          </p>
          <p className="lead">
            Each option shows the same synthetic data in a different order and layout. The product
            text is in Bahasa Indonesia. Use the review bar on each page to show fresh, stale, and
            unavailable detection data.
          </p>
        </section>

        <section aria-labelledby="options-heading">
          <h2 id="options-heading">Options</h2>
          <ul className="options">
            {OPTIONS.map((option) => (
              <li key={option.letter}>
                <span className="option-letter" aria-hidden="true">
                  {option.letter}
                </span>
                <div>
                  <h3>
                    <Link href={option.path}>
                      Option {option.letter}: {option.name}
                    </Link>{" "}
                    <span className="draft-badge">
                      {option.letter === "B" ? "Selected" : "Not selected"}
                    </span>
                  </h3>
                  <p>{option.summary}</p>
                  <p className="muted">{option.fit}</p>
                  <p className="small muted">{option.cache}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="rules-heading">
          <h2 id="rules-heading">Rules that all options keep</h2>
          <div className="split">
            <div>
              <h3>Design language</h3>
              <ul>
                <li>
                  The paper-and-ink style comes from Cukup (
                  <a href="https://github.com/zainfathoni/cukup">zainfathoni/cukup</a>, file{" "}
                  <code>service/dashboard/dashboard.css</code>).
                </li>
                <li>
                  We keep its borders, hard shadows, rounded headings, mono labels, pastel cards,
                  and status shapes.
                </li>
                <li>
                  We change the paper to a greyer tone. Orange is only for satellite detections.
                  Yellow marks a selected control.
                </li>
                <li>The pages use system fonts. Map shapes and images are local files. There are no remote fonts, map tiles, or images.</li>
              </ul>
            </div>
            <div>
              <h3>Data honesty</h3>
              <ul>
                <li>A satellite detection is not a confirmed fire. Every count says this.</li>
                <li>Unavailable data shows a dash and a notice. It never shows zero.</li>
                <li>Stale data shows the time of the last successful update.</li>
                <li>Province lists use alphabetical order. They are not rankings.</li>
                <li>The pages do not show sign-in, report forms, or upload controls.</li>
              </ul>
            </div>
          </div>
        </section>

        <section aria-labelledby="limits-heading">
          <h2 id="limits-heading">What these pages are not</h2>
          <ul>
            <li>All detections, reports, and guidance text are synthetic samples.</li>
            <li>
              Sign-in, report submission, review, ingestion, publication, and withdrawal are not
              implemented.
            </li>
            <li>
              The guidance text is not reviewed by a health professional. It is a placeholder for
              layout review.
            </li>
            <li>
              The public copy images are drawings. No private original exists for these samples.
            </li>
          </ul>
        </section>
      </main>
      <footer className="ka-footer">
        <p>Base map: Natural Earth (public domain). Remove these review routes before release.</p>
      </footer>
    </div>
  );
}
