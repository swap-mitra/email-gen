import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { createApiErrorResponse, parseBody } from "@/lib/api";
import {
  createKnowledgeItemRequestSchema,
  knowledgeItemListResponseSchema,
  knowledgeItemSchema,
} from "@/lib/contracts/api";
import { knowledgeItems } from "@/db/schema";
import { recordActivity } from "@/lib/activity";
import { getDb } from "@/lib/db";
import { inngest, KNOWLEDGE_ITEM_EMBED_EVENT } from "@/lib/inngest";
import { assertUnderRateLimit, RateLimitError } from "@/lib/rate-limit";
import { getActiveWorkspaceContext } from "@/lib/workspaces";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

const CREATE_RATE_LIMIT_MAX = 30;
const CREATE_RATE_LIMIT_WINDOW_MINUTES = 10;

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

    const db = getDb();
    const items = await db
      .select()
      .from(knowledgeItems)
      .where(eq(knowledgeItems.workspaceId, context.workspace.id))
      .orderBy(desc(knowledgeItems.createdAt))
      .limit(limit);

    return NextResponse.json(knowledgeItemListResponseSchema.parse({ items }));
  } catch (error) {
    return createApiErrorResponse({
      code: "internal_error",
      message: error instanceof Error ? error.message : "Failed to list knowledge items.",
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

    if (context.membership.role !== "org:admin") {
      return createApiErrorResponse({
        code: "forbidden",
        message: "Only workspace admins can add knowledge items.",
        status: 403,
      });
    }

    const { data, error } = await parseBody(req, createKnowledgeItemRequestSchema);
    if (error) return error;

    try {
      await assertUnderRateLimit({
        table: knowledgeItems,
        workspaceIdColumn: knowledgeItems.workspaceId,
        createdAtColumn: knowledgeItems.createdAt,
        workspaceId: context.workspace.id,
        windowMinutes: CREATE_RATE_LIMIT_WINDOW_MINUTES,
        max: CREATE_RATE_LIMIT_MAX,
        action: "knowledge items created",
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

    const [item] = await db
      .insert(knowledgeItems)
      .values({
        workspaceId: context.workspace.id,
        title: data.title,
        content: data.content,
        meta: data.meta ?? {},
        embedded: false,
      })
      .returning();

    await recordActivity({
      workspaceId: context.workspace.id,
      actorClerkUserId: context.userId,
      kind: "knowledge_item.created",
      entityType: "knowledge_item",
      entityId: item.id,
      payload: { title: data.title },
    });

    await inngest.send({
      id: `knowledge-item-embed-${item.id}`,
      name: KNOWLEDGE_ITEM_EMBED_EVENT,
      data: {
        knowledgeItemId: item.id,
        workspaceId: context.workspace.id,
      },
    });

    return NextResponse.json(knowledgeItemSchema.parse(item), { status: 201 });
  } catch (error) {
    return createApiErrorResponse({
      code: "internal_error",
      message: error instanceof Error ? error.message : "Failed to create knowledge item.",
      status: 500,
      cause: error,
    });
  }
}
