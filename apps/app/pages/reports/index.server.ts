import { defineHandler } from "void";

import { reportDb, requireMember } from "../../lib/member.ts";
import { listReports } from "../../lib/report-store.ts";

export const loader = defineHandler(async (c) => {
  const member = await requireMember(c);
  return { reports: await listReports(reportDb(), member) };
});
