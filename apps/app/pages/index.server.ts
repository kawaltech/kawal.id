import { defineHandler } from "void";

import { reportDb, requireMember } from "../lib/member.ts";
import { listReports } from "../lib/report-store.ts";

export const loader = defineHandler(async (c) => {
  const member = await requireMember(c);
  const reports = await listReports(reportDb(), member);
  return {
    counts: {
      toReview: reports.filter((r) => r.state === "in_review" && !r.mine).length,
      myDrafts: reports.filter((r) => r.state === "draft" && r.mine).length,
      myInReview: reports.filter((r) => r.state === "in_review" && r.mine).length,
      approved: reports.filter((r) => r.state === "approved").length,
    },
  };
});
