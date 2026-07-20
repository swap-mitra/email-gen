import { NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { createApiErrorResponse, parseBody } from "@/lib/api";
import { approveDraftRequestSchema, approvalSchema } from "@/lib/contracts/api";
import { approvals, drafts, draftVersions } from "@/db/schema";
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
    const { data, error } = await parseBody(req, approveDraftRequestSchema);
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
        message: "Draft is already approved.",
        status: 409,
      });
    }

    // Find the latest version to pin the approval to
    const latestVersion = await db.query.draftVersions.findFirst({
      where: eq(draftVersions.draftId, id),
      orderBy: [desc(draftVersions.versionNumber)],
    });

    if (!latestVersion) {
      return createApiErrorResponse({
        code: "conflict",
        message: "Draft has no versions to approve. Generate or revise the draft first.",
        status: 409,
      });
    }

    const [approval] = await db
      .insert(approvals)
      .values({
        draftId: id,
        draftVersionId: latestVersion.id,
        workspaceId: context.workspace.id,
        reviewerClerkUserId: context.userId,
        note: data.note ?? null,
      })
      .returning();

    // Transition draft to approved state
    await db
      .update(drafts)
      .set({ state: "approved_for_send", updatedAt: new Date() })
      .where(eq(drafts.id, id));

    await recordActivity({
      workspaceId: context.workspace.id,
      actorClerkUserId: context.userId,
      kind: "draft.approved",
      entityType: "draft",
      entityId: id,
      payload: {
        approvalId: approval.id,
        draftVersionId: latestVersion.id,
        versionNumber: latestVersion.versionNumber,
      },
    });

    return NextResponse.json(approvalSchema.parse(approval), { status: 201 });
  } catch (error) {
    return createApiErrorResponse({
      code: "internal_error",
      message: error instanceof Error ? error.message : "Failed to approve draft.",
      status: 500,
      cause: error,
    });
  }
}
