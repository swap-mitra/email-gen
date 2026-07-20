import { NextResponse } from "next/server";
import { createApiErrorResponse } from "@/lib/api";
import { activitiesResponseSchema } from "@/lib/contracts/api";
import { listRecentActivities } from "@/lib/activity";
import { getActiveWorkspaceContext } from "@/lib/workspaces";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export async function GET(req: Request) {
  try {
    const context = await getActiveWorkspaceContext();

    if (!context.userId) {
      return createApiErrorResponse({
        code: "unauthorized",
        message: "Authentication is required.",
        status: 401,
      });
    }

    if (!context.workspace) {
      return createApiErrorResponse({
        code: "forbidden",
        message: "An active workspace is required.",
        status: 403,
      });
    }

    const { searchParams } = new URL(req.url);
    const rawLimit = Number(searchParams.get("limit") ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(1, rawLimit), MAX_LIMIT)
      : DEFAULT_LIMIT;

    const items = await listRecentActivities(context.workspace.id, limit);

    return NextResponse.json(activitiesResponseSchema.parse({ items }));
  } catch (error) {
    return createApiErrorResponse({
      code: "internal_error",
      message: error instanceof Error ? error.message : "Failed to fetch activities.",
      status: 500,
      cause: error,
    });
  }
}
