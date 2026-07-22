import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { createApiErrorResponse, parseBody } from "@/lib/api";
import { exportDraftRequestSchema, exportDraftResponseSchema } from "@/lib/contracts/api";
import {
  deliveryAccounts,
  draftVersions,
  drafts,
  opportunities,
  sendAttempts,
  sendJobs,
} from "@/db/schema";
import { recordActivity } from "@/lib/activity";
import { DeliveryError, type DeliveryErrorReason } from "@/lib/delivery/errors";
import { deliveryProviders } from "@/lib/delivery/registry";
import { getDb } from "@/lib/db";
import { getActiveWorkspaceContext } from "@/lib/workspaces";

/** Maps a delivery failure reason to the HTTP shape it should surface as. */
function errorResponseForReason(reason: DeliveryErrorReason, message: string) {
  const isUserActionable =
    reason === "no_account" || reason === "insufficient_scope" || reason === "invalid_token";

  return createApiErrorResponse({
    code: isUserActionable ? "conflict" : "internal_error",
    message,
    status: isUserActionable ? 409 : 500,
  });
}

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
    const { data, error } = await parseBody(req, exportDraftRequestSchema);
    if (error) return error;
    const provider = data.provider ?? "gmail_draft";

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

    if (draft.state !== "approved_for_send") {
      return createApiErrorResponse({
        code: "conflict",
        message: "Only approved drafts can be exported.",
        status: 409,
      });
    }

    const latestVersion = await db.query.draftVersions.findFirst({
      where: eq(draftVersions.draftId, id),
      orderBy: [desc(draftVersions.versionNumber)],
    });

    if (!latestVersion) {
      return createApiErrorResponse({
        code: "conflict",
        message: "Draft has no versions to export.",
        status: 409,
      });
    }

    const opportunity = await db.query.opportunities.findFirst({
      where: eq(opportunities.id, draft.opportunityId),
    });
    const toEmail =
      typeof opportunity?.normalizedFields?.contactEmail === "string"
        ? opportunity.normalizedFields.contactEmail
        : null;

    const [job] = await db
      .insert(sendJobs)
      .values({
        workspaceId: context.workspace.id,
        draftId: id,
        draftVersionId: latestVersion.id,
        provider,
        status: "running",
        attempts: 1,
        requestedByUserId: context.userId,
      })
      .returning();

    await recordActivity({
      workspaceId: context.workspace.id,
      actorUserId: context.userId,
      kind: "draft.export_started",
      entityType: "draft",
      entityId: id,
      payload: { sendJobId: job.id, provider },
    });

    try {
      const result = await deliveryProviders[provider].createDraft({
        userId: context.userId,
        subject: latestVersion.subject,
        body: latestVersion.body,
        toEmail,
      });

      let deliveryAccountId: string | null = null;
      if (provider === "gmail_draft" && result.externalAccountEmail) {
        const [account] = await db
          .insert(deliveryAccounts)
          .values({
            workspaceId: context.workspace.id,
            userId: context.userId,
            provider,
            externalAccountEmail: result.externalAccountEmail,
            lastUsedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [deliveryAccounts.workspaceId, deliveryAccounts.userId, deliveryAccounts.provider],
            set: {
              externalAccountEmail: result.externalAccountEmail,
              lastUsedAt: new Date(),
              updatedAt: new Date(),
            },
          })
          .returning();
        deliveryAccountId = account.id;
      }

      const [updatedJob] = await db
        .update(sendJobs)
        .set({
          status: "completed",
          providerRef: result.providerRef,
          deliveryAccountId,
          updatedAt: new Date(),
        })
        .where(eq(sendJobs.id, job.id))
        .returning();

      await db.insert(sendAttempts).values({
        sendJobId: job.id,
        workspaceId: context.workspace.id,
        attemptNumber: 1,
        status: "succeeded",
        providerRef: result.providerRef,
      });

      await recordActivity({
        workspaceId: context.workspace.id,
        actorUserId: context.userId,
        kind: "draft.export_completed",
        entityType: "draft",
        entityId: id,
        payload: { sendJobId: job.id, provider, providerRef: result.providerRef },
      });

      return NextResponse.json(
        exportDraftResponseSchema.parse({
          ...updatedJob,
          externalAccountEmail: result.externalAccountEmail,
        }),
        { status: 201 },
      );
    } catch (err) {
      const reason: DeliveryErrorReason = err instanceof DeliveryError ? err.reason : "upstream_error";
      const message =
        err instanceof DeliveryError
          ? err.message
          : "Failed to export the draft. Try again in a moment.";

      await db
        .update(sendJobs)
        .set({ status: "failed", error: message, updatedAt: new Date() })
        .where(eq(sendJobs.id, job.id));

      await db.insert(sendAttempts).values({
        sendJobId: job.id,
        workspaceId: context.workspace.id,
        attemptNumber: 1,
        status: "failed",
        error: message,
      });

      await recordActivity({
        workspaceId: context.workspace.id,
        actorUserId: context.userId,
        kind: "draft.export_failed",
        entityType: "draft",
        entityId: id,
        payload: { sendJobId: job.id, provider, reason, error: message },
      });

      return errorResponseForReason(reason, message);
    }
  } catch (error) {
    return createApiErrorResponse({
      code: "internal_error",
      message: error instanceof Error ? error.message : "Failed to export draft.",
      status: 500,
      cause: error,
    });
  }
}
