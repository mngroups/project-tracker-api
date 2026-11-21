import { isGranted } from "@mono/auth";
import { AppError, type AuthUser } from "@mono/server-kit";
import { PERMISSIONS } from "./permissions.js";

export const MESSAGE_NO_ORG = "Organisasi aktif tidak ditemukan";

/** Who is calling and what they may do, within the active organisation. */
export type Caller = {
  userId: string;
  userName: string;
  orgId: string;
  canSeeInternal: boolean;
  canManage: boolean;
};

/** Every query is scoped to `orgId`: never read or write outside it. */
export function callerOf(user: AuthUser | null | undefined): Caller {
  if (!user?.orgId) throw new AppError(403, MESSAGE_NO_ORG);
  const canManage = isGranted(user.permissions, PERMISSIONS.manage);
  const { name, preferred_username: username } = user.claims;
  return {
    userId: user.id,
    userName:
      (typeof name === "string" && name) || (typeof username === "string" && username) || user.id,
    orgId: user.orgId,
    canManage,
    canSeeInternal: canManage || isGranted(user.permissions, PERMISSIONS.internalView),
  };
}
