import { NextResponse } from "next/server";
import { eq, and, max } from "drizzle-orm";
import { createApiErrorResponse, parseBody } from "@/lib/api";
import { reviseDraftRequestSchema, draftVersionSchema } from "@/lib/contracts/api";
import { drafts, draftVersions } from "@/db/schema";
import { recordActivity } from "@/lib/activity";
import { getDb } from "@/lib/db";
import { getActiveWorkspaceContext } from "@/lib/workspaces";

export async function POST(
  req: Request,
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
    const { data, error } = await parseBody(req, reviseDraftRequestSchema);
    if (error) return error;

    const db = getDb();

    const draft = await db.query.drafts.findFirst({
      where: and(
        eq(drafts.id, id),
        eq(drafts.workspaceId, context.workspace.id),
      ),
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

    // Determine the next version number
    const [{ maxVersion }] = await db
      .select({ maxVersion: max(draftVersions.versionNumber) })
      .from(draftVersions)
      .where(eq(draftVersions.draftId, id));

    const nextVersion = (maxVersion ?? 0) + 1;

    const [newVersion] = await db
      .insert(draftVersions)
      .values({
        draftId: id,
        workspaceId: context.workspace.id,
        versionNumber: nextVersion,
        subject: data.subject,
        body: data.body,
        source: "human_revised",
        authorClerkUserId: context.userId,
        groundingRefs: [],
      })
      .returning();

    // Transition draft state to reflect human review
    await db
      .update(drafts)
      .set({ state: "draft_reviewed", updatedAt: new Date() })
      .where(eq(drafts.id, id));

    await recordActivity({
      workspaceId: context.workspace.id,
      actorClerkUserId: context.userId,
      kind: "draft.revised",
      entityType: "draft",
      entityId: id,
      payload: { versionNumber: nextVersion, draftVersionId: newVersion.id },
    });

    return NextResponse.json(draftVersionSchema.parse(newVersion), { status: 201 });
  } catch (error) {
    return createApiErrorResponse({
      code: "internal_error",
      message: error instanceof Error ? error.message : "Failed to revise draft.",
      status: 500,
      cause: error,
    });
  }
}
