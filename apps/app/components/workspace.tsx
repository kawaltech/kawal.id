import type { ReactNode } from "react";

import {
  DECISION_LABELS,
  SOURCE_LABELS,
  STATE_LABELS,
  formatWib,
  type Decision,
  type ReportState,
} from "../lib/report-model.ts";
import type { EventView, ReviewView, RevisionView } from "../lib/report-store.ts";

export function StateBadge({ state }: { state: ReportState }) {
  return (
    <span className={`state-badge ${state}`}>
      <span className="state-mark" aria-hidden="true" />
      {STATE_LABELS[state]}
    </span>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p className="field-error" id={id}>
      {message}
    </p>
  );
}

/** The facts of one revision, in the trail layout of the public report card. */
export function RevisionFacts({ revision }: { revision: RevisionView }) {
  return (
    <dl className="trail">
      <div>
        <dt>Wilayah</dt>
        <dd>
          {revision.area ?? "—"}
          {revision.province ? `, ${revision.province}` : ""}
        </dd>
      </div>
      <div>
        <dt>Diamati</dt>
        <dd>{formatWib(revision.observedAt)}</dd>
      </div>
      <div>
        <dt>Sumber laporan</dt>
        <dd>{revision.sourceChannel ? SOURCE_LABELS[revision.sourceChannel] : "—"}</dd>
      </div>
      <div>
        <dt>Revisi</dt>
        <dd>
          {revision.number}
          {revision.submittedAt
            ? ` · dikirim ${formatWib(revision.submittedAt)}`
            : " · belum dikirim"}
        </dd>
      </div>
    </dl>
  );
}

const EVENT_TEXT: Record<string, (revision: number | null) => string> = {
  "report.create": () => "membuat draf",
  "report.submit": (n) => `mengirim revisi ${n} untuk ditinjau`,
  "report.discard": () => "membuang draf",
  "review.approve": (n) => `menyetujui revisi ${n}`,
  "review.request_changes": (n) => `meminta perubahan pada revisi ${n}`,
  "review.reject": (n) => `menolak revisi ${n}`,
};

function eventClass(action: string) {
  if (action === "report.submit") return "submit";
  if (action.startsWith("review.")) return action.slice("review.".length);
  return "";
}

/** History from audit events, with the review note beside each decision. */
export function Timeline({ events, reviews }: { events: EventView[]; reviews: ReviewView[] }) {
  if (events.length === 0) return <p className="empty">Belum ada riwayat.</p>;
  const notes = new Map(reviews.map((review) => [review.revisionNumber, review]));
  return (
    <ol className="timeline">
      {events.map((event) => {
        const review = event.action.startsWith("review.") ? notes.get(event.revisionNumber) : null;
        return (
          <li key={event.id} className={eventClass(event.action)}>
            <p className="when">{formatWib(event.occurredAt)}</p>
            <p>
              <strong>{event.actorIsViewer ? "Anda" : event.actorName}</strong>{" "}
              {EVENT_TEXT[event.action]?.(event.revisionNumber) ?? event.action}.
            </p>
            {review?.note ? <blockquote>{review.note}</blockquote> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function DecisionName({ decision }: { decision: Decision }) {
  return <>{DECISION_LABELS[decision]}</>;
}

export function Section({
  id,
  eyebrow,
  title,
  children,
  actions,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-judul`}>
      <div className="section-heading">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2 id={`${id}-judul`}>{title}</h2>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
