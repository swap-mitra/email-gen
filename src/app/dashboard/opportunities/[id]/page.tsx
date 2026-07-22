import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { drafts, draftVersions, opportunities } from "@/db/schema";
import { listActivitiesForEntity } from "@/lib/activity";
import { getDb } from "@/lib/db";
import {
  displayableFields,
  draftStateBadgeClass,
  formatActivityKind,
  formatDateTime,
  formatDraftState,
  opportunityTitle,
} from "@/lib/labels";
import { getActiveWorkspaceContext } from "@/lib/workspaces";
import { OpportunityActions } from "./opportunity-actions";

export const dynamic = "force-dynamic";

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await getActiveWorkspaceContext();
  if (!context.workspace) redirect("/dashboard");

  const { id } = await params;
  const db = getDb();

  const opportunity = await db.query.opportunities.findFirst({
    where: and(eq(opportunities.id, id), eq(opportunities.workspaceId, context.workspace.id)),
  });
  if (!opportunity) notFound();

  const [opportunityDrafts, ingestLog] = await Promise.all([
    db.query.drafts.findMany({
      where: and(eq(drafts.opportunityId, id), eq(drafts.workspaceId, context.workspace.id)),
      with: {
        versions: { orderBy: [desc(draftVersions.versionNumber)], limit: 1 },
      },
      orderBy: [desc(drafts.updatedAt)],
    }),
    listActivitiesForEntity(context.workspace.id, id),
  ]);

  const fields = displayableFields(opportunity.normalizedFields);
  const isWorking =
    opportunity.ingestStatus === "pending" || opportunity.ingestStatus === "running";

  return (
    <>
      <AutoRefresh enabled={isWorking} />

      <p className="crumbs">
        <Link href="/dashboard/opportunities">Opportunities</Link>
        <span aria-hidden="true"> / </span>
        <span className="t-mono">{opportunity.id.slice(0, 8)}</span>
      </p>

      <div className="page-head">
        <div>
          <p className="t-label page-kicker">Opportunity</p>
          <h1 className="page-title">
            {opportunityTitle(opportunity.normalizedFields, "Untitled opportunity")}
          </h1>
        </div>
      </div>

      {/* Row 1: extraction status + ingest log, equal height */}
      <div className="opp-detail-top">
        <div className="dash-block-card">
          <h2 className="block-title">Extraction status</h2>
          <div className="opp-status-row">
            <span className="t-label">Source</span>
            <a
              className="t-mono opp-status-url"
              href={opportunity.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              {opportunity.sourceUrl}
            </a>
          </div>
          <div className="opp-status-row">
            <span className="t-label">Ingestion</span>
            <span className={`opp-badge opp-badge-${opportunity.ingestStatus}`}>
              {opportunity.ingestStatus}
            </span>
            {isWorking && <span className="opp-working" aria-hidden="true" />}
            {opportunity.ingestAttempts > 1 && (
              <span className="t-mono opp-attempts">attempt {opportunity.ingestAttempts}</span>
            )}
          </div>
          {opportunity.ingestStatus === "failed" && (
            <p className="opp-error">{opportunity.ingestError ?? "Ingestion failed."}</p>
          )}
          <OpportunityActions
            opportunityId={opportunity.id}
            ingestStatus={opportunity.ingestStatus}
          />
        </div>

        <div className="dash-block-card">
          <h2 className="block-title">Ingest log</h2>
          {ingestLog.length === 0 ? (
            <p className="empty-state">No events recorded for this opportunity.</p>
          ) : (
            <ul className="activity-feed">
              {ingestLog.map((activity) => (
                <li key={activity.id}>
                  <span className="activity-kind">{formatActivityKind(activity.kind)}</span>
                  <span className="activity-entity">
                    {activity.actorUserId ? "user action" : "system"}
                  </span>
                  <time className="activity-time" dateTime={activity.createdAt.toISOString()}>
                    {formatDateTime(activity.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Row 2: normalized fields, extraction metadata, drafts — same total
          width as row 1, three equal columns */}
      <div className="opp-detail-bottom">
        <div className="opp-fields">
          <p className="t-label opp-fields-title">Normalized fields</p>
          {fields.length === 0 ? (
            <p className="empty-state">No normalized fields extracted yet.</p>
          ) : (
            <dl className="opp-fields-grid">
              {fields.map(([label, value]) => (
                <div className="opp-field" key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <details className="raw-details" open={!!opportunity.extractionMeta}>
          <summary className="t-label">Extraction metadata</summary>
          {opportunity.extractionMeta ? (
            <pre className="raw-pre">{JSON.stringify(opportunity.extractionMeta, null, 2)}</pre>
          ) : (
            <p className="empty-state">No extraction metadata yet.</p>
          )}
        </details>

        <div className="dash-block-card">
          <h2 className="block-title">Drafts ({opportunityDrafts.length})</h2>
          {opportunityDrafts.length === 0 ? (
            <p className="empty-state">
              No drafts yet.
              {opportunity.ingestStatus === "completed"
                ? " Generate one with the button above."
                : " Drafts can be generated once ingestion completes."}
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>State</th>
                    <th>Generation</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunityDrafts.map((draft) => (
                    <tr key={draft.id}>
                      <td className="cell-title">
                        <Link href={`/dashboard/drafts/${draft.id}`}>
                          {draft.versions[0]?.subject ?? `Draft ${draft.id.slice(0, 8)}`}
                        </Link>
                      </td>
                      <td>
                        <span className={draftStateBadgeClass(draft.state)}>
                          {formatDraftState(draft.state)}
                        </span>
                      </td>
                      <td>
                        <span className={`opp-badge opp-badge-${draft.generationStatus}`}>
                          {draft.generationStatus}
                        </span>
                      </td>
                      <td className="cell-time">{formatDateTime(draft.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
