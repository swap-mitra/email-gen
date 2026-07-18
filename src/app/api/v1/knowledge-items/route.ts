import { NextResponse } from "next/server";
import { createApiErrorResponse, parseBody } from "@/lib/api";
import { createKnowledgeItemRequestSchema, knowledgeItemSchema } from "@/lib/contracts/api";
import { knowledgeItems } from "@/db/schema";
import { recordActivity } from "@/lib/activity";
import { getDb } from "@/lib/db";
import { inngest, KNOWLEDGE_ITEM_EMBED_EVENT } from "@/lib/inngest";
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

    const { data, error } = await parseBody(req, createKnowledgeItemRequestSchema);
    if (error) return error;

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
    });
  }
}
