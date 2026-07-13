import { describe, expect, it } from "vitest";
import { assertWorkspaceAccess } from "@/lib/authz";

describe("assertWorkspaceAccess", () => {
  it("allows access within the same workspace", () => {
    expect(() =>
      assertWorkspaceAccess({
        activeWorkspaceId: "workspace-1",
        requestedWorkspaceId: "workspace-1",
      }),
    ).not.toThrow();
  });

  it("rejects cross-workspace access", () => {
    expect(() =>
      assertWorkspaceAccess({
        activeWorkspaceId: "workspace-1",
        requestedWorkspaceId: "workspace-2",
      }),
    ).toThrow("Cross-workspace access is forbidden.");
  });
});
