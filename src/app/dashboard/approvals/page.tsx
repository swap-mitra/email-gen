import { and, desc, eq, ne } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LocalTime } from "@/components/local-time";
import { drafts, draftVersions } from "@/db/schema";
import { getDb } from "@/lib/db";
import { draftStateBadgeClass, formatDraftState, urlHost } from "@/lib/labels";
import { getActiveWorkspaceContext } from "@/lib/workspaces";
import { QuickApprove } from "./quick-approve";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const context = await getActiveWorkspaceContext();
  if (!context.workspace) redirect("/dashboard");

  const db = getDb();
  const queue = await db.query.drafts.findMany({
    where: and(
      eq(drafts.workspaceId, context.workspace.id),
      eq(drafts.generationStatus, "completed"),
      ne(drafts.state, "approved_for_send"),
    ),
    with: {
      opportunity: { columns: { id: true, sourceUrl: true } },
      versions: { orderBy: [desc(draftVersions.versionNumber)], limit: 1 },
    },
    orderBy: [desc(drafts.updatedAt)],
    limit: 100,
  });

  return (
    <>
      <div className="page-head">
        <div>
          <p className="t-label page-kicker">Approval queue</p>
          <h1 className="page-title">Drafts awaiting review</h1>
        </div>
      </div>

      <p className="page-intro">
        Every approval is recorded with your reviewer identity. Open a draft to revise it or attach
        a note; quick-approve records the approval without a note.
      </p>

      {queue.length === 0 ? (
        <p className="empty-state">
          Nothing waiting for review. Generated drafts land here until they are approved.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Opportunity</th>
                <th>State</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((draft) => (
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
                  <td className="cell-time">
                    <LocalTime value={draft.updatedAt} />
                  </td>
                  <td>
                    <QuickApprove draftId={draft.id} />
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
