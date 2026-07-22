import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { knowledgeItems } from "@/db/schema";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/labels";
import { getActiveWorkspaceContext } from "@/lib/workspaces";
import { KnowledgeForm } from "./knowledge-form";

export const dynamic = "force-dynamic";

function contentPreview(content: string, max = 160): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export default async function KnowledgePage() {
  const context = await getActiveWorkspaceContext();
  if (!context.workspace) redirect("/dashboard");

  const isAdmin = context.membership.role === "org:admin";

  const db = getDb();
  const items = await db
    .select({
      id: knowledgeItems.id,
      title: knowledgeItems.title,
      content: knowledgeItems.content,
      embedded: knowledgeItems.embedded,
      createdAt: knowledgeItems.createdAt,
    })
    .from(knowledgeItems)
    .where(eq(knowledgeItems.workspaceId, context.workspace.id))
    .orderBy(desc(knowledgeItems.createdAt))
    .limit(100);

  const embeddingInProgress = items.some((item) => !item.embedded);

  return (
    <>
      <AutoRefresh enabled={embeddingInProgress} />

      <div className="page-head">
        <div>
          <p className="t-label page-kicker">Knowledge hub</p>
          <h1 className="page-title">Workspace knowledge</h1>
        </div>
      </div>

      <p className="page-intro">
        Proof points, case studies, and product facts stored here are retrieved and cited when
        drafts are generated. The more specific the knowledge, the more grounded the outreach.
      </p>

      <div className="dash-block-card">
        <h2 className="block-title">Add knowledge</h2>
        {isAdmin ? (
          <KnowledgeForm />
        ) : (
          <p className="empty-state">
            Only workspace admins can add knowledge items. Ask an admin to add proof points here.
          </p>
        )}
      </div>

      <div className="dash-block-card">
        <h2 className="block-title">Items ({items.length})</h2>
        {items.length === 0 ? (
          <p className="empty-state">
            No knowledge items yet. Add your first proof point above — drafts generated without
            knowledge fall back to the opportunity content alone.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Content</th>
                  <th>Embedding</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="cell-title">{item.title}</td>
                    <td className="cell-muted">{contentPreview(item.content)}</td>
                    <td>
                      {item.embedded ? (
                        <span className="opp-badge opp-badge-completed">embedded</span>
                      ) : (
                        <span className="opp-badge opp-badge-running">embedding</span>
                      )}
                    </td>
                    <td className="cell-time">{formatDateTime(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
