import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { apiRoute, createApiErrorResponse } from "@/lib/api";
import { opportunitySchema } from "@/lib/contracts/api";
import { opportunities } from "@/db/schema";
import { getDb } from "@/lib/db";
import { requireWorkspaceContext } from "@/lib/workspaces";

export const GET = apiRoute(
  "Failed to fetch opportunity.",
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { context, response } = await requireWorkspaceContext();
    if (response) return response;

    const { id } = await params;
    const db = getDb();

    const opportunity = await db.query.opportunities.findFirst({
      where: and(eq(opportunities.id, id), eq(opportunities.workspaceId, context.workspace.id)),
    });

    if (!opportunity) {
      return createApiErrorResponse({
        code: "not_found",
        message: "Opportunity not found.",
        status: 404,
      });
    }

    return NextResponse.json(opportunitySchema.parse(opportunity));
  },
);

export const DELETE = apiRoute(
  "Failed to delete opportunity.",
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { context, response } = await requireWorkspaceContext();
    if (response) return response;

    const { id } = await params;
    const db = getDb();

    const existing = await db.query.opportunities.findFirst({
      where: and(eq(opportunities.id, id), eq(opportunities.workspaceId, context.workspace.id)),
    });

    if (!existing) {
      return createApiErrorResponse({
        code: "not_found",
        message: "Opportunity not found.",
        status: 404,
      });
    }

    // Drafts, draft versions, and approvals cascade off the opportunity row.
    await db.delete(opportunities).where(eq(opportunities.id, id));

    return new NextResponse(null, { status: 204 });
  },
);
