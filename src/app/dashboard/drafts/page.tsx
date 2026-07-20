import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { drafts, draftVersions } from "@/db/schema";
import { getDb } from "@/lib/db";
import { draftStateBadgeClass, formatDateTime, formatDraftState, urlHost } from "@/lib/labels";
import { getActiveWorkspaceContext } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  const context = await getActiveWorkspaceContext();
  if (!context.workspace) redirect("/dashboard");

  const db = getDb();
  const items = await db.query.drafts.findMany({
    where: eq(drafts.workspaceId, context.workspace.id),
    with: {
      opportunity: { columns: { id: true, sourceUrl: true } },
      versions: { orderBy: [desc(draftVersions.versionNumber)], limit: 1 },
    },
    orderBy: [desc(drafts.updatedAt)],
    limit: 100,
  });

  const generationInProgress = items.some(
    (item) => item.generationStatus === "pending" || item.generationStatus === "running",
  );

  return (
    <>
      <AutoRefresh enabled={generationInProgress} />

      <div className="page-head">
        <div>
          <p className="t-label page-kicker">Drafts</p>
          <h1 className="page-title">All drafts</h1>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="empty-state">
          No drafts yet. Generate one from an{" "}
          <Link href="/dashboard/opportunities">opportunity</Link> once ingestion completes.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Opportunity</th>
                <th>State</th>
                <th>Generation</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.map((draft) => (
                <tr key={draft.id}>
                  <td className="cell-title">
                    <Link href={`/dashboard/drafts/${draft.id}`}>
                      {draft.versions[0]?.subject ?? `Draft ${draft.id.slice(0, 8)}`}
                    </Link>
                  </td>
                  <td className="cell-muted t-mono">
                    <Link href={`/dashboard/opportunities/${draft.opportunity.id}`}>
                      {urlHost(draft.opportunity.sourceUrl)}
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
    </>
  );
}
