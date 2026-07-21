import { NextResponse } from "next/server";
import { eq, and, desc, inArray } from "drizzle-orm";
import { createApiErrorResponse } from "@/lib/api";
import { draftSchema, knowledgeItemSchema } from "@/lib/contracts/api";
import { drafts, draftVersions, knowledgeItems, sendJobs } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getActiveWorkspaceContext } from "@/lib/workspaces";

export async function GET(
  _req: Request,
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
    const db = getDb();

    const draft = await db.query.drafts.findFirst({
      where: and(
        eq(drafts.id, id),
        eq(drafts.workspaceId, context.workspace.id),
      ),
      with: {
        versions: {
          orderBy: [desc(draftVersions.versionNumber)],
          limit: 1,
        },
      },
    });

    if (!draft) {
      return createApiErrorResponse({
        code: "not_found",
        message: "Draft not found.",
        status: 404,
      });
    }

    const latestVersion = draft.versions[0] ?? null;

    // Fetch evidence knowledge items referenced in the latest version
    let evidence: ReturnType<typeof knowledgeItemSchema.parse>[] = [];
    if (latestVersion && latestVersion.groundingRefs.length > 0) {
      const items = await db
        .select()
        .from(knowledgeItems)
        .where(
          and(
            eq(knowledgeItems.workspaceId, context.workspace.id),
            inArray(knowledgeItems.id, latestVersion.groundingRefs),
          ),
        );
      evidence = items.map((item) => knowledgeItemSchema.parse(item));
    }

    const latestSendJob = await db.query.sendJobs.findFirst({
      where: eq(sendJobs.draftId, id),
      orderBy: [desc(sendJobs.createdAt)],
      with: { deliveryAccount: true },
    });

    const payload = draftSchema.parse({ ...draft, latestVersion, latestSendJob: latestSendJob ?? null });

    return NextResponse.json({
      ...payload,
      evidence,
      latestSendJobAccountEmail: latestSendJob?.deliveryAccount?.externalAccountEmail ?? null,
    });
  } catch (error) {
    return createApiErrorResponse({
      code: "internal_error",
      message: error instanceof Error ? error.message : "Failed to fetch draft.",
      status: 500,
      cause: error,
    });
  }
}
