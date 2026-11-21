import type { MilestoneStatus } from "../../db/schema/index.js";

export type ApprovalAction = "submit" | "approve" | "request_changes";

const TRANSITIONS: Record<ApprovalAction, Partial<Record<MilestoneStatus, MilestoneStatus>>> = {
  submit: {
    pending: "awaiting_approval",
    in_progress: "awaiting_approval",
    changes_requested: "awaiting_approval",
  },
  approve: { awaiting_approval: "approved" },
  request_changes: { awaiting_approval: "changes_requested" },
};

/** The status an action leads to, or `null` when it is not allowed from `from`. */
export function nextStatus(action: ApprovalAction, from: MilestoneStatus): MilestoneStatus | null {
  return TRANSITIONS[action][from] ?? null;
}
