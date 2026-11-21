import { MILESTONE_STATUSES } from "../../../db/schema/index.js";
import { nextStatus } from "../approval.js";

describe("nextStatus", () => {
  it.each(["pending", "in_progress", "changes_requested"] as const)("submit from %s", (from) => {
    expect(nextStatus("submit", from)).toBe("awaiting_approval");
  });

  it("approve and request_changes only from awaiting_approval", () => {
    expect(nextStatus("approve", "awaiting_approval")).toBe("approved");
    expect(nextStatus("request_changes", "awaiting_approval")).toBe("changes_requested");
  });

  it("rejects every other transition", () => {
    expect(nextStatus("approve", "approved")).toBeNull();
    expect(nextStatus("submit", "awaiting_approval")).toBeNull();
    expect(nextStatus("submit", "approved")).toBeNull();
    for (const from of MILESTONE_STATUSES.filter((s) => s !== "awaiting_approval")) {
      expect(nextStatus("approve", from)).toBeNull();
      expect(nextStatus("request_changes", from)).toBeNull();
    }
  });
});
