import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { createApiErrorResponse } from "@/lib/api";
import { opportunitySchema } from "@/lib/contracts/api";
import { opportunities } from "@/db/schema";
import { recordActivity } from "@/lib/activity";
import { getDb } from "@/lib/db";
import { inngest, OPPORTUNITY_INGEST_EVENT } from "@/lib/inngest";
import { getActiveWorkspaceContext } from "@/lib/workspaces";

export async function POST(
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

    const existing = await db.query.opportunities.findFirst({
      where: and(
        eq(opportunities.id, id),
        eq(opportunities.workspaceId, context.workspace.id),
      ),
    });

    if (!existing) {
      return createApiErrorResponse({
        code: "not_found",
        message: "Opportunity not found.",
        status: 404,
      });
    }

    if (existing.ingestStatus === "running") {
      return createApiErrorResponse({
        code: "conflict",
        message: "Ingestion is already running for this opportunity.",
        status: 409,
      });
    }

    const now = new Date();

    const [updated] = await db
      .update(opportunities)
      .set({
        ingestStatus: "pending",
        ingestError: null,
        ingestAttempts: existing.ingestAttempts + 1,
        updatedAt: now,
      })
      .where(eq(opportunities.id, id))
      .returning();

    await recordActivity({
      workspaceId: context.workspace.id,
      actorClerkUserId: context.userId,
      kind: "opportunity.reingest_requested",
      entityType: "opportunity",
      entityId: id,
      payload: { attempt: updated.ingestAttempts },
    });

    // Dispatch a new ingest run. Attempt number in the key ensures a
    // fresh Inngest execution even if the previous one is still in the log.
    await inngest.send({
      id: `opportunity-ingest-${id}-attempt-${updated.ingestAttempts}`,
      name: OPPORTUNITY_INGEST_EVENT,
      data: {
        opportunityId: id,
        workspaceId: context.workspace.id,
        attempt: updated.ingestAttempts,
      },
    });

    return NextResponse.json(opportunitySchema.parse(updated));
  } catch (error) {
    return createApiErrorResponse({
      code: "internal_error",
      message: error instanceof Error ? error.message : "Failed to reingest opportunity.",
      status: 500,
    });
  }
}
