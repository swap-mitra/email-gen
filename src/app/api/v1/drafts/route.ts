import { NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { apiRoute, createApiErrorResponse, parseBody } from "@/lib/api";
import {
  createDraftRequestSchema,
  draftListResponseSchema,
  draftSchema,
} from "@/lib/contracts/api";
import { drafts, draftVersions, opportunities } from "@/db/schema";
import { recordActivity } from "@/lib/activity";
import { getDb } from "@/lib/db";
import { inngest } from "@/lib/inngest";
import { assertUnderRateLimit, RateLimitError } from "@/lib/rate-limit";
import { requireWorkspaceContext } from "@/lib/workspaces";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

const CREATE_RATE_LIMIT_MAX = 20;
const CREATE_RATE_LIMIT_WINDOW_MINUTES = 10;

export const GET = apiRoute("Failed to list drafts.", async (req: Request) => {
  const { context, response } = await requireWorkspaceContext();
  if (response) return response;

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
});

export const POST = apiRoute("Failed to create draft.", async (req: Request) => {
  const { context, response } = await requireWorkspaceContext();
  if (response) return response;

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

  try {
    await assertUnderRateLimit({
      table: drafts,
      workspaceIdColumn: drafts.workspaceId,
      createdAtColumn: drafts.createdAt,
      workspaceId: context.workspace.id,
      windowMinutes: CREATE_RATE_LIMIT_WINDOW_MINUTES,
      max: CREATE_RATE_LIMIT_MAX,
      action: "drafts generated",
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
    actorUserId: context.userId,
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

  return NextResponse.json(draftSchema.parse({ ...draft, latestVersion: null }), { status: 201 });
});
