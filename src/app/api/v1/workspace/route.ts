import { NextResponse } from "next/server";
import { createApiErrorResponse } from "@/lib/api";
import { workspaceContextResponseSchema } from "@/lib/contracts/api";
import { getActiveWorkspaceContext } from "@/lib/workspaces";

export async function GET() {
  try {
    const context = await getActiveWorkspaceContext();

    if (!context.userId) {
      return createApiErrorResponse({
        code: "unauthorized",
        message: "Authentication is required.",
        status: 401,
      });
    }

    if (!context.orgId) {
      return createApiErrorResponse({
        code: "forbidden",
        message: "An active workspace is required.",
        status: 403,
      });
    }

    const payload = workspaceContextResponseSchema.parse({
      workspace: context.workspace,
      membership: context.membership,
      viewer: {
        clerkUserId: context.userId,
        clerkOrganizationId: context.orgId,
      },
    });

    return NextResponse.json(payload);
  } catch (error) {
    return createApiErrorResponse({
      code: "internal_error",
      message: error instanceof Error ? error.message : "Unable to resolve workspace context.",
      status: 500,
    });
  }
}
