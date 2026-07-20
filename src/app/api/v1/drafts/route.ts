import { NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { createApiErrorResponse, parseBody } from "@/lib/api";
import {
  createDraftRequestSchema,
  draftListResponseSchema,
  draftSchema,
} from "@/lib/contracts/api";
import { drafts, draftVersions, opportunities } from "@/db/schema";
import { recordActivity } from "@/lib/activity";
import { getDb } from "@/lib/db";
import { inngest } from "@/lib/inngest";
import { getActiveWorkspaceContext } from "@/lib/workspaces";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

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
    const state = searchParams.get("state");
    const opportunityId = searchParams.get("opportunityId");

    const db = getDb();
    const rows = await db.query.drafts.findMany({
      where: and(
        eq(drafts.workspaceId, context.workspace.id),
        state ? eq(drafts.state, state) : undefined,
        opportunityId ? eq(drafts.opportunityId, opportunityId) : undefined,
      ),
      with: {
        opportunity: { columns: { id: true, sourceUrl: true } },
        versions: {
          orderBy: [desc(draftVersions.versionNumber)],
          limit: 1,
        },
      },
      orderBy: [desc(drafts.updatedAt)],
      limit,
    });

    const items = rows.map(({ versions, ...draft }) => ({
      ...draft,
      latestVersion: versions[0] ?? null,
    }));

    return NextResponse.json(draftListResponseSchema.parse({ items }));
  } catch (error) {
    return createApiErrorResponse({
      code: "internal_error",
      message: error instanceof Error ? error.message : "Failed to list drafts.",
      status: 500,
      cause: error,
    });
  }
}

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

    const { data, error } = await parseBody(req, createDraftRequestSchema);
    if (error) return error;

    const db = getDb();

    // Ensure the opportunity belongs to this workspace
    const opportunity = await db.query.opportunities.findFirst({
      where: and(
        eq(opportunities.id, data.opportunityId),
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

    if (opportunity.ingestStatus !== "completed") {
      return createApiErrorResponse({
        code: "conflict",
        message: "Opportunity ingestion must be completed before generating a draft.",
        status: 409,
      });
    }

    const [draft] = await db
      .insert(drafts)
      .values({
        workspaceId: context.workspace.id,
        opportunityId: data.opportunityId,
        state: "knowledge_matched",
        generationStatus: "pending",
      })
      .returning();

    await recordActivity({
      workspaceId: context.workspace.id,
      actorClerkUserId: context.userId,
      kind: "draft.created",
      entityType: "draft",
      entityId: draft.id,
      payload: { opportunityId: data.opportunityId },
    });

    await inngest.send({
      id: `draft-generate-${draft.id}`,
      name: "email-gen/draft.generate",
      data: {
        draftId: draft.id,
        workspaceId: context.workspace.id,
        opportunityId: data.opportunityId,
      },
    });

    return NextResponse.json(
      draftSchema.parse({ ...draft, latestVersion: null }),
      { status: 201 },
    );
  } catch (error) {
    return createApiErrorResponse({
      code: "internal_error",
      message: error instanceof Error ? error.message : "Failed to create draft.",
      status: 500,
      cause: error,
    });
  }
}
