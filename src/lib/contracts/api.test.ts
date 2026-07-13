import { describe, expect, it } from "vitest";
import { apiErrorSchema, healthResponseSchema, workspaceContextResponseSchema } from "./api";

describe("api contracts", () => {
  it("accepts the standard health response", () => {
    const result = healthResponseSchema.parse({
      ok: true,
      service: "web",
      version: 1,
    });

    expect(result.ok).toBe(true);
  });

  it("rejects malformed API errors", () => {
    expect(() =>
      apiErrorSchema.parse({
        error: {
          code: "oops",
          message: "",
          requestId: "",
        },
      }),
    ).toThrow();
  });

  it("accepts the workspace context response", () => {
    const workspaceId = crypto.randomUUID();

    const result = workspaceContextResponseSchema.parse({
      workspace: {
        id: workspaceId,
        clerkOrganizationId: "org_123",
        name: "Acme",
        slug: "acme",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      membership: {
        workspaceId,
        clerkUserId: "user_123",
        role: "org:admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      viewer: {
        clerkUserId: "user_123",
        clerkOrganizationId: "org_123",
      },
    });

    expect(result.workspace.slug).toBe("acme");
  });
});
