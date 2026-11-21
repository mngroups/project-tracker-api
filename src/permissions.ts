/**
 * This app's permission strings, used with `app.requirePermission(...)`. They are
 * granted per client in the central auth service; add new ones here first.
 */
export const PERMISSIONS = {
  view: "project:view",
  manage: "project:manage",
  taskUpdate: "project.task:update",
  milestoneApprove: "project.milestone:approve",
  attachmentUpload: "project.attachment:upload",
  internalView: "project.internal:view",
} as const;
