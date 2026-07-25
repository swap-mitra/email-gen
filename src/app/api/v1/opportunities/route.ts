import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { apiRoute, createApiErrorResponse, parseBody, parseLimit } from "@/lib/api";
import {
  createOpportunityRequestSchema,
  opportunityListResponseSchema,
  opportunitySchema,
} from "@/lib/contracts/api";
import { opportunities } from "@/db/schema";
import { recordActivity } from "@/lib/activity";
import { getDb } from "@/lib/db";
import { inngest, OPPORTUNITY_INGEST_EVENT } from "@/lib/inngest";
import { assertPublicHttpUrl, UnsafeUrlError } from "@/lib/ingestion/url-safety";
import { assertUnderRateLimit, RateLimitError } from "@/lib/rate-limit";
import { requireWorkspaceContext } from "@/lib/workspaces";

const CREATE_RATE_LIMIT_MAX = 20;
const CREATE_RATE_LIMIT_WINDOW_MINUTES = 10;

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

export const GET = apiRoute("Failed to list opportunities.", async (req: Request) => {
  const { context, response } = await requireWorkspaceContext();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams, { fallback: DEFAULT_LIMIT, max: MAX_LIMIT });

  const db = getDb();
  const items = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.workspaceId, context.workspace.id))
    .orderBy(desc(opportunities.createdAt))
    .limit(limit);

  return NextResponse.json(opportunityListResponseSchema.parse({ items }));
});

export const POST = apiRoute("Failed to create opportunity.", async (req: Request) => {
  const { context, response } = await requireWorkspaceContext();
  if (response) return response;

  const { data, error } = await parseBody(req, createOpportunityRequestSchema);
  if (error) return error;

  try {
    await assertPublicHttpUrl(data.sourceUrl);
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      return createApiErrorResponse({
        code: "bad_request",
        message: err.message,
        status: 400,
      });
    }
    throw err;
  }

  try {
    await assertUnderRateLimit({
      table: opportunities,
      workspaceIdColumn: opportunities.workspaceId,
      createdAtColumn: opportunities.createdAt,
      workspaceId: context.workspace.id,
      windowMinutes: CREATE_RATE_LIMIT_WINDOW_MINUTES,
      max: CREATE_RATE_LIMIT_MAX,
      action: "opportunities created",
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
    actorUserId: context.userId,
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
});
