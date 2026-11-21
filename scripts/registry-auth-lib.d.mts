// Types for registry-auth-lib.mjs (plain JS so `pnpm registry:run` works before any install).
export function normalizeGroupId(groupId: unknown): string;
export function validateRegistryCredentials(credentials: { groupId: unknown; token: unknown }): {
  groupId: string;
  token: string;
};
export function renderRegistryConfig(
  template: string,
  credentials: { groupId: unknown; token: unknown }
): string;
