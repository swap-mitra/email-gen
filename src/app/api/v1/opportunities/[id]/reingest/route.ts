import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { apiRoute, createApiErrorResponse } from "@/lib/api";
import { opportunitySchema } from "@/lib/contracts/api";
import { activities, opportunities } from "@/db/schema";
import { recordActivity } from "@/lib/activity";
import { getDb } from "@/lib/db";
import { inngest, OPPORTUNITY_INGEST_EVENT } from "@/lib/inngest";
import { assertUnderRateLimit, RateLimitError } from "@/lib/rate-limit";
import { requireWorkspaceContext } from "@/lib/workspaces";

const REINGEST_RATE_LIMIT_MAX = 10;
const REINGEST_RATE_LIMIT_WINDOW_MINUTES = 10;

export const POST = apiRoute(
  "Failed to reingest opportunity.",
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

    if (existing.ingestStatus === "running") {
      return createApiErrorResponse({
        code: "conflict",
        message: "Ingestion is already running for this opportunity.",
        status: 409,
      });
    }

    try {
      await assertUnderRateLimit({
        table: activities,
        workspaceIdColumn: activities.workspaceId,
        createdAtColumn: activities.createdAt,
        workspaceId: context.workspace.id,
        windowMinutes: REINGEST_RATE_LIMIT_WINDOW_MINUTES,
        max: REINGEST_RATE_LIMIT_MAX,
        action: "re-ingest requests",
        extraCondition: eq(activities.kind, "opportunity.reingest_requested"),
      });
    } catch (err) {
      if (err instanceof RateLimitError) {
        return createApiErrorResponse({
          code: "rate_limited",
          message: err.message,
          status: 429,
        });
      }
      throw err;
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
      actorUserId: context.userId,
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
  },
);
