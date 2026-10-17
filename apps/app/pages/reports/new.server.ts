import { defineHandler } from "void";

import { reportDb, requireMember } from "../../lib/member.ts";
import { validateDraft } from "../../lib/report-model.ts";
import { conflict, invalid, readFields } from "../../lib/report-http.ts";
import { createReport } from "../../lib/report-store.ts";

export const loader = defineHandler(async (c) => {
  await requireMember(c);
  return {};
});

/** Creates a draft. Only a title is necessary. */
export const action = defineHandler(async (c) => {
  const member = await requireMember(c);
  const result = validateDraft(await readFields(c), { complete: false });
  if (!result.ok) invalid(result.errors);
  const created = await createReport(reportDb(), member, result.content);
  if (!created.created) return conflict(c);
  return c.redirect(`/reports/${created.id}`, 303);
});
