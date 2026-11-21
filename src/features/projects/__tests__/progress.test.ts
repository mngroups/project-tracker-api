import { isOverdue, progressOf } from "../progress.js";

describe("progressOf", () => {
  it("rounds the done share to a whole percent and is 0 without tasks", () => {
    expect(progressOf(0, 0)).toBe(0);
    expect(progressOf(1, 3)).toBe(33);
    expect(progressOf(2, 3)).toBe(67);
    expect(progressOf(3, 3)).toBe(100);
  });
});

describe("isOverdue", () => {
  it("is true only for an open project past its target date", () => {
    expect(isOverdue("2026-11-20", "in_progress", "2026-11-21")).toBe(true);
    expect(isOverdue("2026-11-21", "in_progress", "2026-11-21")).toBe(false);
    expect(isOverdue("2026-11-20", "completed", "2026-11-21")).toBe(false);
    expect(isOverdue("2026-11-20", "cancelled", "2026-11-21")).toBe(false);
    expect(isOverdue(null, "in_progress", "2026-11-21")).toBe(false);
  });
});
