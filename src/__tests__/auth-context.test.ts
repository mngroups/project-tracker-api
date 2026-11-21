import type { AuthUser } from "@mono/server-kit";
import { callerOf } from "../auth-context.js";
import { PERMISSIONS } from "../permissions.js";
import { ORG_A } from "./helpers.js";

const MEMBER = [
  PERMISSIONS.view,
  PERMISSIONS.taskUpdate,
  PERMISSIONS.attachmentUpload,
  PERMISSIONS.internalView,
];
const CLIENT = [PERMISSIONS.view, PERMISSIONS.milestoneApprove, PERMISSIONS.attachmentUpload];

function user(permissions: string[], extra: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "u-1",
    permissions: new Set(permissions),
    claims: {},
    orgId: ORG_A,
    ...extra,
  } as AuthUser;
}

describe("callerOf", () => {
  it("rejects a missing user with 403", () => {
    expect(() => callerOf(undefined)).toThrowError(
      expect.objectContaining({ code: 403, message: "Organisasi aktif tidak ditemukan" })
    );
  });

  it("rejects a user without an active org", () => {
    expect(() => callerOf(user([PERMISSIONS.view], { orgId: undefined }))).toThrowError(
      expect.objectContaining({ code: 403, message: "Organisasi aktif tidak ditemukan" })
    );
  });

  it("lets project:all manage and see internal items", () => {
    expect(callerOf(user(["project:all"]))).toMatchObject({
      orgId: ORG_A,
      canManage: true,
      canSeeInternal: true,
    });
  });

  it("lets a team member see internal items but not manage", () => {
    expect(callerOf(user(MEMBER))).toMatchObject({ canManage: false, canSeeInternal: true });
  });

  it("gives a client neither", () => {
    expect(callerOf(user(CLIENT))).toMatchObject({ canManage: false, canSeeInternal: false });
  });

  it("lets project:manage alone see internal items", () => {
    expect(callerOf(user([PERMISSIONS.manage]))).toMatchObject({
      canManage: true,
      canSeeInternal: true,
    });
  });

  it("resolves the display name from name, preferred_username, then id", () => {
    expect(callerOf(user([], { claims: { name: "Budi", preferred_username: "b" } })).userName).toBe(
      "Budi"
    );
    expect(callerOf(user([], { claims: { preferred_username: "b" } })).userName).toBe("b");
    expect(callerOf(user([])).userName).toBe("u-1");
    expect(callerOf(user([])).userId).toBe("u-1");
  });
});
