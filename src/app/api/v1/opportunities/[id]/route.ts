import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { createApiErrorResponse } from "@/lib/api";
import { opportunitySchema } from "@/lib/contracts/api";
import { opportunities } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getActiveWorkspaceContext } from "@/lib/workspaces";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

    const { id } = await params;
    const db = getDb();

    const opportunity = await db.query.opportunities.findFirst({
      where: and(
        eq(opportunities.id, id),
        eq(opportunities.workspaceId, context.workspace.id),
      ),
    });

    if (!opportunity) {
      return createApiErrorResponse({
        code: "not_found",
        message: "Opportunity not found.",
        status: 404,
      });
    }

    return NextResponse.json(opportunitySchema.parse(opportunity));
  } catch (error) {
    return createApiErrorResponse({
      code: "internal_error",
      message: error instanceof Error ? error.message : "Failed to fetch opportunity.",
      status: 500,
    });
  }
}
