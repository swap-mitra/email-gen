import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { approvals, drafts, draftVersions, knowledgeItems, opportunities, sendJobs } from "@/db/schema";
import { resolveClerkUserName } from "@/lib/clerk-users";
import { getDb } from "@/lib/db";
import { formatDateTime, opportunityTitle, urlHost } from "@/lib/labels";
import { getActiveWorkspaceContext } from "@/lib/workspaces";
import { DraftEditor } from "./draft-editor";
import { DraftRetry } from "./draft-retry";

export const dynamic = "force-dynamic";

export default async function DraftEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await getActiveWorkspaceContext();
  if (!context.workspace) redirect("/dashboard");

  const { id } = await params;
  const db = getDb();

  const draft = await db.query.drafts.findFirst({
    where: and(eq(drafts.id, id), eq(drafts.workspaceId, context.workspace.id)),
    with: {
      versions: { orderBy: [desc(draftVersions.versionNumber)], limit: 1 },
    },
  });
  if (!draft) notFound();

  const latestVersion = draft.versions[0] ?? null;

  const [opportunity, evidence, approval, latestSendJob] = await Promise.all([
    db.query.opportunities.findFirst({
      where: and(
        eq(opportunities.id, draft.opportunityId),
        eq(opportunities.workspaceId, context.workspace.id),
      ),
    }),
    latestVersion && latestVersion.groundingRefs.length > 0
      ? db
          .select({
            id: knowledgeItems.id,
            title: knowledgeItems.title,
            content: knowledgeItems.content,
          })
          .from(knowledgeItems)
          .where(
            and(
              eq(knowledgeItems.workspaceId, context.workspace.id),
              inArray(knowledgeItems.id, latestVersion.groundingRefs),
            ),
          )
      : Promise.resolve([]),
    db.query.approvals.findFirst({
      where: and(eq(approvals.draftId, id), eq(approvals.workspaceId, context.workspace.id)),
      orderBy: [desc(approvals.createdAt)],
    }),
    db.query.sendJobs.findFirst({
      where: eq(sendJobs.draftId, id),
      orderBy: [desc(sendJobs.createdAt)],
      with: { deliveryAccount: true },
    }),
  ]);

  const reviewerName = approval ? await resolveClerkUserName(approval.reviewerClerkUserId) : null;

  const isGenerating =
    draft.generationStatus === "pending" || draft.generationStatus === "running";

  return (
    <>
      <AutoRefresh enabled={isGenerating} />

      <p className="crumbs">
        <Link href="/dashboard/opportunities">Opportunities</Link>
        <span aria-hidden="true"> / </span>
        <Link href={`/dashboard/opportunities/${draft.opportunityId}`}>
          {opportunity
            ? opportunityTitle(opportunity.normalizedFields, urlHost(opportunity.sourceUrl))
            : draft.opportunityId.slice(0, 8)}
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="t-mono">draft {draft.id.slice(0, 8)}</span>
      </p>

      <div className="page-head">
        <div>
          <p className="t-label page-kicker">Draft editor</p>
          <h1 className="page-title">
            {latestVersion?.subject ?? "Draft in progress"}
          </h1>
        </div>
      </div>

      {isGenerating && (
        <div className="dash-block-card">
          <div className="opp-status-row">
            <span className="t-label">Draft generation</span>
            <span className={`opp-badge opp-badge-${draft.generationStatus}`}>
              {draft.generationStatus}
            </span>
            <span className="opp-working" aria-hidden="true" />
          </div>
          <p className="opp-hint">
            Retrieving workspace knowledge and drafting a grounded email — this page refreshes
            automatically.
          </p>
        </div>
      )}

      {draft.generationStatus === "failed" && (
        <div className="dash-block-card">
          <p className="opp-error">{draft.generationError ?? "Draft generation failed."}</p>
          <DraftRetry opportunityId={draft.opportunityId} />
        </div>
      )}

      {draft.generationStatus === "completed" && !latestVersion && (
        <div className="dash-block-card">
          <p className="opp-error">
            Generation finished but no draft content was returned. Generate a new draft from the
            opportunity page.
          </p>
          <DraftRetry opportunityId={draft.opportunityId} />
        </div>
      )}

      {latestVersion && (
        <DraftEditor
          draftId={draft.id}
          state={draft.state}
          initialVersion={{
            versionNumber: latestVersion.versionNumber,
            subject: latestVersion.subject,
            body: latestVersion.body,
            source: latestVersion.source,
            createdAt: latestVersion.createdAt.toISOString(),
          }}
          evidence={evidence}
          initialExport={
            latestSendJob
              ? {
                  status: latestSendJob.status,
                  error: latestSendJob.error,
                  externalAccountEmail: latestSendJob.deliveryAccount?.externalAccountEmail ?? null,
                }
              : null
          }
        />
      )}

      {approval && (
        <p className="approval-record">
          Approved by <strong>{reviewerName}</strong> on{" "}
          {formatDateTime(approval.createdAt)}
          {approval.note ? <> — “{approval.note}”</> : null}
        </p>
      )}
    </>
  );
}
