import type { CloudContext } from "void";

import { getAppIdentity } from "./identity.ts";
import type { ReportActor } from "./report-store.ts";
import { primaryReviewerDb, requireReviewer } from "./reviewer-guard.ts";

/** What a page shows about the signed-in member. No IDs. */
export type Viewer = { name: string; role: "reviewer" | "admin" };

declare module "void" {
  interface CloudContextVariables {
    shared: { viewer: Viewer | null };
  }
}

/**
 * The signed-in member with an active grant, read again from the D1 primary.
 * The middleware already checked access; each loader and action checks again,
 * because a grant can be revoked between two requests.
 */
export async function requireMember(c: CloudContext): Promise<ReportActor & { name: string }> {
  const identity = await getAppIdentity(c);
  const grant = await requireReviewer(identity);
  return {
    userId: grant.userId,
    googleSubject: grant.googleSubject,
    grantId: grant.grantId,
    role: grant.role,
    name: identity!.name,
  };
}

export { primaryReviewerDb as reportDb };
