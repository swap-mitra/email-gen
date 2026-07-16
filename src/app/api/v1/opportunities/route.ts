import { NextResponse } from "next/server";
import { createApiErrorResponse, parseBody } from "@/lib/api";
import { createOpportunityRequestSchema, opportunitySchema } from "@/lib/contracts/api";
import { opportunities } from "@/db/schema";
import { recordActivity } from "@/lib/activity";
import { getDb } from "@/lib/db";
import { inngest, OPPORTUNITY_INGEST_EVENT } from "@/lib/inngest";
import { getActiveWorkspaceContext } from "@/lib/workspaces";

export async function POST(req: Request) {
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

    const { data, error } = await parseBody(req, createOpportunityRequestSchema);
    if (error) return error;

    const db = getDb();

    const [opportunity] = await db
      .insert(opportunities)
      .values({
        workspaceId: context.workspace.id,
        sourceUrl: data.sourceUrl,
        ingestStatus: "pending",
      })
      .returning();

    await recordActivity({
      workspaceId: context.workspace.id,
      actorClerkUserId: context.userId,
      kind: "opportunity.created",
      entityType: "opportunity",
      entityId: opportunity.id,
      payload: { sourceUrl: data.sourceUrl },
    });

    // Dispatch the ingest-opportunity Inngest function.
    // Idempotency key prevents duplicate runs if this fires twice.
    await inngest.send({
      id: `opportunity-ingest-${opportunity.id}-attempt-1`,
      name: OPPORTUNITY_INGEST_EVENT,
      data: {
        opportunityId: opportunity.id,
        workspaceId: context.workspace.id,
        attempt: 1,
      },
    });

    return NextResponse.json(opportunitySchema.parse(opportunity), { status: 201 });
  } catch (error) {
    return createApiErrorResponse({
      code: "internal_error",
      message: error instanceof Error ? error.message : "Failed to create opportunity.",
      status: 500,
    });
  }
}
