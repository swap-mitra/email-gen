import { describe, expect, it } from "vitest";
import {
  apiErrorSchema,
  exportDraftResponseSchema,
  healthResponseSchema,
  sendJobSchema,
  workspaceContextResponseSchema,
} from "./api";

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
    const result = workspaceContextResponseSchema.parse({
      workspace: {
        id: crypto.randomUUID(),
        organizationId: "org_123",
        name: "Acme",
        slug: "acme",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      membership: {
        id: "member_123",
        organizationId: "org_123",
        userId: "user_123",
        role: "admin",
        createdAt: new Date(),
      },
      viewer: {
        userId: "user_123",
        organizationId: "org_123",
      },
    });

    expect(result.workspace.slug).toBe("acme");
  });

  it("accepts a completed send job", () => {
    const result = sendJobSchema.parse({
      id: crypto.randomUUID(),
      workspaceId: crypto.randomUUID(),
      draftId: crypto.randomUUID(),
      draftVersionId: crypto.randomUUID(),
      deliveryAccountId: crypto.randomUUID(),
      provider: "gmail_draft",
      status: "completed",
      providerRef: "draft-abc",
      error: null,
      attempts: 1,
      requestedByUserId: "user_123",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(result.status).toBe("completed");
  });

  it("accepts an export response with a resolved account email", () => {
    const result = exportDraftResponseSchema.parse({
      id: crypto.randomUUID(),
      workspaceId: crypto.randomUUID(),
      draftId: crypto.randomUUID(),
      draftVersionId: crypto.randomUUID(),
      deliveryAccountId: null,
      provider: "manual_export",
      status: "completed",
      providerRef: null,
      error: null,
      attempts: 1,
      requestedByUserId: "user_123",
      createdAt: new Date(),
      updatedAt: new Date(),
      externalAccountEmail: null,
    });

    expect(result.provider).toBe("manual_export");
  });

  it("rejects an unknown delivery provider key", () => {
    expect(() =>
      sendJobSchema.parse({
        id: crypto.randomUUID(),
        workspaceId: crypto.randomUUID(),
        draftId: crypto.randomUUID(),
        draftVersionId: crypto.randomUUID(),
        deliveryAccountId: null,
        provider: "carrier_pigeon",
        status: "completed",
        providerRef: null,
        error: null,
        attempts: 1,
        requestedByUserId: "user_123",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ).toThrow();
  });
});
