import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { opportunities } from "@/db/schema";
import { getDb } from "@/lib/db";
import { LocalTime } from "@/components/local-time";
import { opportunityTitle, urlHost } from "@/lib/labels";
import { getActiveWorkspaceContext } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  const context = await getActiveWorkspaceContext();
  if (!context.workspace) redirect("/dashboard");

  const db = getDb();
  const items = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.workspaceId, context.workspace.id))
    .orderBy(desc(opportunities.createdAt))
    .limit(100);

  const ingestInProgress = items.some(
    (item) => item.ingestStatus === "pending" || item.ingestStatus === "running",
  );

  return (
    <>
      <AutoRefresh enabled={ingestInProgress} />

      <div className="page-head">
        <div>
          <p className="t-label page-kicker">Opportunities</p>
          <h1 className="page-title">All opportunities</h1>
        </div>
        <Link className="btn btn-primary" href="/dashboard">
          New opportunity
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="empty-state">
          No opportunities yet. Submit a job or company URL from the{" "}
          <Link href="/dashboard">overview</Link> to create your first one.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Opportunity</th>
                <th>Source</th>
                <th>Ingestion</th>
                <th>Attempts</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="cell-title">
                    <Link href={`/dashboard/opportunities/${item.id}`}>
                      {opportunityTitle(item.normalizedFields, urlHost(item.sourceUrl))}
                    </Link>
                  </td>
                  <td className="cell-muted t-mono">{urlHost(item.sourceUrl)}</td>
                  <td>
                    <span className={`opp-badge opp-badge-${item.ingestStatus}`}>
                      {item.ingestStatus}
                    </span>
                  </td>
                  <td className="cell-muted">{item.ingestAttempts}</td>
                  <td className="cell-time">
                    <LocalTime value={item.createdAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
