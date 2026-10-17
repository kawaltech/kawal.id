import { defineHandler } from "void";

import { reportDb, requireMember } from "../../lib/member.ts";
import { validateDecision, validateDraft } from "../../lib/report-model.ts";
import { conflict, invalid, notFound, readFields, readVersion } from "../../lib/report-http.ts";
import { decideReview, discardDraft, getReport, saveDraft } from "../../lib/report-store.ts";

export const loader = defineHandler(async (c) => {
  const member = await requireMember(c);
  const report = await getReport(reportDb(), c.req.param("id") ?? "", member);
  if (!report) return notFound();
  return { report };
});

// Each action reads the member and the report again. The loader result is not
// used for authorization. The store also checks the state, the version, the
// grant, and the actor rule inside the write.
export const actions = {
  /** Save the open revision. With intent "submit", also freeze it and send it for review. */
  save: defineHandler(async (c) => {
    const member = await requireMember(c);
    const reportId = c.req.param("id") ?? "";
    const report = await getReport(reportDb(), reportId, member);
    if (!report) return notFound();
    const fields = await readFields(c);
    const submit = fields.intent === "submit";
    const version = readVersion(fields.version);
    if (!version || !report.can.edit) return conflict(c);
    const result = validateDraft(fields, { complete: submit });
    if (!result.ok) invalid(result.errors);
    const saved = await saveDraft(reportDb(), {
      actor: member,
      reportId,
      version,
      content: result.content,
      submit,
    });
    if (!saved.changed) return conflict(c);
  }),

  discard: defineHandler(async (c) => {
    const member = await requireMember(c);
    const reportId = c.req.param("id") ?? "";
    const report = await getReport(reportDb(), reportId, member);
    if (!report) return notFound();
    const version = readVersion((await readFields(c)).version);
    if (!version || !report.can.discard) return conflict(c);
    const discarded = await discardDraft(reportDb(), { actor: member, reportId, version });
    if (!discarded.changed) return conflict(c);
  }),

  decide: defineHandler(async (c) => {
    const member = await requireMember(c);
    const reportId = c.req.param("id") ?? "";
    const report = await getReport(reportDb(), reportId, member);
    if (!report) return notFound();
    const fields = await readFields(c);
    const version = readVersion(fields.version);
    if (!version || !report.can.review || !fields.revisionId) return conflict(c);
    const result = validateDecision(fields);
    if (!result.ok) invalid(result.errors);
    const decided = await decideReview(reportDb(), {
      actor: member,
      reportId,
      version,
      revisionId: fields.revisionId,
      decision: result.decision,
      note: result.note,
    });
    if (!decided.changed) return conflict(c);
  }),
};
