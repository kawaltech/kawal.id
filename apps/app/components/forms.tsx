import type { ReactNode } from "react";
import { useForm } from "@void/react";
import type { VoidActionError } from "void/pages-client";

import {
  DECISIONS,
  DECISION_LABELS,
  LIMITS,
  PROVINCES,
  SOURCE_CHANNELS,
  SOURCE_LABELS,
  type DraftFields,
} from "../lib/report-model.ts";
import { FieldError } from "./workspace.tsx";

type Fields = Record<string, string>;

type ActionForm<T extends Fields> = {
  data: T;
  setData: <K extends keyof T & string>(field: K, value: T[K]) => void;
  errors: Partial<Record<keyof T & string, string>>;
  error: VoidActionError | null;
  pending: boolean;
  post: (formData: FormData) => void;
  put: (formData: FormData) => void;
  patch: (formData: FormData) => void;
  delete: (formData: FormData) => void;
};

/**
 * useForm with plain string URLs. Generated route types are not part of the
 * repository type check, so the URL is not checked here.
 */
function useActionForm<T extends Fields>(url: string, defaults: T, id?: string): ActionForm<T> {
  return useForm(
    url as never,
    defaults as never,
    (id ? { params: { id } } : undefined) as never,
  ) as never;
}

function actionMessage(error: VoidActionError) {
  const body = error.body as { message?: unknown } | null;
  return <p>{typeof body?.message === "string" ? body.message : "Permintaan gagal. Coba lagi."}</p>;
}

/**
 * Void's Form joins field messages into one sentence. This form shows a count
 * instead, beside the messages at each field, and the server message for a
 * conflict.
 */
function ActionFormShell({ form, children }: { form: ActionForm<Fields>; children: ReactNode }) {
  const count = Object.values(form.errors).filter(Boolean).length;
  return (
    <form action={form.post} aria-busy={form.pending} noValidate>
      {form.error ? (
        <div role="alert">{actionMessage(form.error)}</div>
      ) : count > 0 ? (
        <div role="alert">
          <p>Periksa {count} isian yang ditandai di bawah.</p>
        </div>
      ) : null}
      {children}
    </form>
  );
}

function described(form: ActionForm<Fields>, name: string, hint?: boolean) {
  const error = form.errors[name];
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby":
      [hint ? `${name}-hint` : "", error ? `${name}-error` : ""].filter(Boolean).join(" ") ||
      undefined,
  } as const;
}

/** Create or edit a draft. A new draft needs only a title. */
export function DraftForm({
  reportId,
  version,
  initial,
}: {
  reportId?: string;
  version?: number;
  initial: DraftFields;
}) {
  const editing = reportId !== undefined;
  // useForm sends this model, not the DOM form data. The version and the
  // intent of the pressed button are part of the model.
  const form = useActionForm(
    editing ? "/reports/:id?save" : "/reports/new",
    { ...initial, version: String(version ?? ""), intent: "save" },
    reportId,
  );
  const field = (name: keyof DraftFields) => ({
    id: name,
    name,
    value: form.data[name],
    onChange: (event: { target: { value: string } }) => form.setData(name, event.target.value),
  });
  const generic = form as unknown as ActionForm<Fields>;
  return (
    <ActionFormShell form={form as unknown as ActionForm<Fields>}>
      <div className="form-grid">
        <div className="field wide">
          <label htmlFor="title">Judul</label>
          <p className="hint" id="title-hint">
            Ringkas apa yang terjadi, misalnya “Asap tebal di jalan desa sejak pagi”.
          </p>
          <input
            type="text"
            maxLength={LIMITS.title}
            required
            autoComplete="off"
            {...field("title")}
            {...described(generic, "title", true)}
          />
          <FieldError id="title-error" message={form.errors.title} />
        </div>

        <div className="field wide">
          <label htmlFor="account">Apa yang diamati</label>
          <p className="hint" id="account-hint">
            Tulis apa yang dilihat, dicium, atau dialami pelapor. Tulis fakta, bukan dugaan
            penyebab.
          </p>
          <textarea
            maxLength={LIMITS.account}
            rows={7}
            {...field("account")}
            {...described(generic, "account", true)}
          />
          <p className="counter" aria-hidden="true">
            {form.data.account.length}/{LIMITS.account}
          </p>
          <FieldError id="account-error" message={form.errors.account} />
        </div>

        <div className="field">
          <label htmlFor="observedAtWib">Waktu pengamatan (WIB)</label>
          <input
            type="datetime-local"
            {...field("observedAtWib")}
            {...described(generic, "observedAtWib")}
          />
          <FieldError id="observedAtWib-error" message={form.errors.observedAtWib} />
        </div>

        <div className="field">
          <label htmlFor="province">Provinsi</label>
          <select {...field("province")} {...described(generic, "province")}>
            <option value="">Pilih provinsi</option>
            {PROVINCES.map((province) => (
              <option key={province} value={province}>
                {province}
              </option>
            ))}
          </select>
          <FieldError id="province-error" message={form.errors.province} />
        </div>

        <div className="field">
          <label htmlFor="area">Kecamatan atau desa</label>
          <p className="hint" id="area-hint">
            Nama wilayah saja. Jangan tulis alamat rumah atau titik koordinat.
          </p>
          <input
            type="text"
            maxLength={LIMITS.area}
            autoComplete="off"
            {...field("area")}
            {...described(generic, "area", true)}
          />
          <FieldError id="area-error" message={form.errors.area} />
        </div>

        <fieldset className="field" {...described(generic, "sourceChannel")}>
          <legend>Sumber laporan</legend>
          <div className="choices">
            {SOURCE_CHANNELS.map((channel) => (
              <label className="choice" key={channel}>
                <input
                  type="radio"
                  name="sourceChannel"
                  value={channel}
                  checked={form.data.sourceChannel === channel}
                  onChange={() => form.setData("sourceChannel", channel)}
                />
                <span>{SOURCE_LABELS[channel]}</span>
              </label>
            ))}
          </div>
          <FieldError id="sourceChannel-error" message={form.errors.sourceChannel} />
        </fieldset>
      </div>

      <div className="form-actions">
        {editing ? (
          <p className="small muted full">
            Simpan draf kapan saja. Setelah Anda mengirimnya, revisi ini terkunci dan anggota tim
            lain meninjaunya.
          </p>
        ) : null}
        {editing ? (
          <>
            <button
              type="submit"
              onClick={() => form.setData("intent", "save")}
              disabled={form.pending}
            >
              Simpan draf
            </button>
            <span className="spacer" />
            <button
              type="submit"
              onClick={() => form.setData("intent", "submit")}
              className="primary"
              disabled={form.pending}
            >
              Kirim untuk ditinjau
            </button>
          </>
        ) : (
          <>
            <button type="submit" className="primary" disabled={form.pending}>
              Simpan draf
            </button>
            <span className="small muted">
              Draf hanya terlihat oleh Anda sampai Anda mengirimnya.
            </span>
          </>
        )}
      </div>
    </ActionFormShell>
  );
}

const DECISION_HINTS = {
  approve: "Isi akurat dan aman. Tetap privat.",
  request_changes: "Penulis memperbaiki lalu mengirim lagi.",
  reject: "Laporan tidak dilanjutkan. Final.",
} as const;

/** A decision on one frozen revision. */
export function DecisionForm({
  reportId,
  version,
  revisionId,
  revisionNumber,
}: {
  reportId: string;
  version: number;
  revisionId: string;
  revisionNumber: number;
}) {
  const form = useActionForm(
    "/reports/:id?decide",
    { decision: "", note: "", version: String(version), revisionId },
    reportId,
  );
  const generic = form as unknown as ActionForm<Fields>;
  return (
    <ActionFormShell form={form as unknown as ActionForm<Fields>}>
      <fieldset className="field" {...described(generic, "decision")}>
        <legend>Keputusan untuk revisi {revisionNumber}</legend>
        <div className="decisions">
          {DECISIONS.map((decision) => (
            <label className={`decision ${decision}`} key={decision}>
              <input
                type="radio"
                name="decision"
                value={decision}
                checked={form.data.decision === decision}
                onChange={() => form.setData("decision", decision)}
              />
              <span>
                <strong>{DECISION_LABELS[decision]}</strong>
                <small>{DECISION_HINTS[decision]}</small>
              </span>
            </label>
          ))}
        </div>
        <FieldError id="decision-error" message={form.errors.decision} />
      </fieldset>
      <div className="field" style={{ marginTop: "1rem" }}>
        <label htmlFor="note">Catatan untuk penulis</label>
        <p className="hint" id="note-hint">
          Wajib untuk “Minta perubahan” dan “Tolak”. Penulis dan anggota tim membaca catatan ini.
        </p>
        <textarea
          id="note"
          name="note"
          rows={4}
          maxLength={LIMITS.note}
          value={form.data.note}
          onChange={(event) => form.setData("note", event.target.value)}
          {...described(generic, "note", true)}
        />
        <FieldError id="note-error" message={form.errors.note} />
      </div>
      <div className="form-actions">
        <span className="small muted">Keputusan tidak dapat diubah.</span>
        <span className="spacer" />
        <button type="submit" className="primary" disabled={form.pending}>
          Simpan keputusan
        </button>
      </div>
    </ActionFormShell>
  );
}

export function DiscardForm({ reportId, version }: { reportId: string; version: number }) {
  const form = useActionForm("/reports/:id?discard", { version: String(version) }, reportId);
  return (
    <details>
      <summary>Buang draf</summary>
      <ActionFormShell form={form as unknown as ActionForm<Fields>}>
        <p className="small">
          Draf yang dibuang tidak dapat dipakai lagi. Isinya tetap tersimpan untuk catatan audit.
        </p>
        <button type="submit" className="danger" disabled={form.pending}>
          Ya, buang draf ini
        </button>
      </ActionFormShell>
    </details>
  );
}
