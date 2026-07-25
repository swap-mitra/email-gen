import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { apiRoute, createApiErrorResponse, parseBody } from "@/lib/api";
import { reviseDraftRequestSchema, draftVersionSchema } from "@/lib/contracts/api";
import { drafts } from "@/db/schema";
import { recordActivity } from "@/lib/activity";
import { getDb } from "@/lib/db";
import { insertNextDraftVersion } from "@/lib/draft-versions";
import { requireWorkspaceContext } from "@/lib/workspaces";

export const POST = apiRoute(
  "Failed to revise draft.",
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { context, response } = await requireWorkspaceContext();
    if (response) return response;

    const { id } = await params;
    const { data, error } = await parseBody(req, reviseDraftRequestSchema);
    if (error) return error;

    const db = getDb();

    const draft = await db.query.drafts.findFirst({
      where: and(eq(drafts.id, id), eq(drafts.workspaceId, context.workspace.id)),
    });

    if (!draft) {
      return createApiErrorResponse({
        code: "not_found",
        message: "Draft not found.",
        status: 404,
      });
    }

    if (draft.state === "approved_for_send") {
      return createApiErrorResponse({
        code: "conflict",
        message: "An approved draft cannot be revised. Create a new draft instead.",
        status: 409,
      });
    }

    const newVersion = await insertNextDraftVersion({
      draftId: id,
      workspaceId: context.workspace.id,
      subject: data.subject,
      body: data.body,
      source: "human_revised",
      authorUserId: context.userId,
    });

    // Transition draft state to reflect human review
    await db
      .update(drafts)
      .set({ state: "draft_reviewed", updatedAt: new Date() })
      .where(eq(drafts.id, id));

    await recordActivity({
      workspaceId: context.workspace.id,
      actorUserId: context.userId,
      kind: "draft.revised",
      entityType: "draft",
      entityId: id,
      payload: { versionNumber: newVersion.versionNumber, draftVersionId: newVersion.id },
    });

    return NextResponse.json(draftVersionSchema.parse(newVersion), { status: 201 });
  },
);
