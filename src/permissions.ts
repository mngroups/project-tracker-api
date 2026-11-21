/**
 * This app's permission strings, used with `app.requirePermission(...)`. They are
 * granted per client in the central auth service; add new ones here first.
 */
export const PERMISSIONS = {
  exampleView: "example.item:view",
  exampleCreate: "example.item:create",
} as const;
