import type { ProjectStatus } from "./schema.js";

/** Whole-percent share of done tasks; 0 when there are none. */
export function progressOf(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((100 * done) / total);
}

/** `today` and `targetDate` are `YYYY-MM-DD`, which compare correctly as strings. */
export function isOverdue(
  targetDate: string | null,
  status: ProjectStatus,
  today: string
): boolean {
  return (
    targetDate !== null && targetDate < today && status !== "completed" && status !== "cancelled"
  );
}
