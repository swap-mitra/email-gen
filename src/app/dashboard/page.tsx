import { CreateOrganization } from "@clerk/nextjs";
import { listRecentActivities } from "@/lib/activity";
import { getActiveWorkspaceContext } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

const sprintItems = [
  "Protected dashboard routes via Clerk middleware",
  "Workspace bootstrap and membership sync against Clerk organization context",
  "Full domain model schema — opportunities, drafts, knowledge items, approvals",
  "9 typed API endpoints with Zod contracts and activity logging",
];

export default async function DashboardPage() {
  const context = await getActiveWorkspaceContext();

  /* ── No-org state ─────────────────────────────────────────────── */
  if (!context.orgId) {
    return (
      <div className="setup-prompt">
        <div className="setup-prompt-header">
          <h1>Create your first workspace</h1>
        </div>
        <div className="setup-prompt-body">
          <p>
            Email GenAI uses Clerk organizations as the source of truth for workspace isolation.
            Create an organization and this dashboard will automatically provision the matching
            workspace record in PostgreSQL.
          </p>
          <CreateOrganization afterCreateOrganizationUrl="/dashboard" skipInvitationScreen />
        </div>
      </div>
    );
  }

  const activities = await listRecentActivities(context.workspace.id, 8);

  return (
    <>
      {/* ── Workspace status bar ──────────────────────────────────── */}
      <div className="ws-bar">
        <div className="ws-bar-name">
          <h1>{context.workspace.name}</h1>
          <p>ACTIVE WORKSPACE</p>
        </div>
        <div className="ws-bar-stat">
          <span className="ws-bar-stat-label">Workspace ID</span>
          <span className="ws-bar-stat-value">{context.workspace.id.slice(0, 8)}…</span>
        </div>
        <div className="ws-bar-stat">
          <span className="ws-bar-stat-label">Org slug</span>
          <span className="ws-bar-stat-value">{context.workspace.slug}</span>
        </div>
        <div className="ws-bar-stat">
          <span className="ws-bar-stat-label">Your role</span>
          <span className="ws-bar-stat-value">{context.membership.role}</span>
        </div>
      </div>

      {/* ── Main grid ─────────────────────────────────────────────── */}
      <div className="dash-grid">

        {/* Sprint milestones */}
        <div className="dash-block">
          <h2>Sprint milestones</h2>
          <ul className="feature-list">
            {sprintItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        {/* Next up */}
        <div className="dash-block">
          <h2>Next up</h2>
          <ul className="feature-list">
            <li>Inngest async workflow — ingest-opportunity + generate-draft jobs</li>
            <li>Ingestion pipeline — URL fetch, HTML extract, Playwright fallback</li>
            <li>AI retrieval — hybrid pgvector search + grounded generation</li>
            <li>UI pages — opportunity detail, draft editor, approval queue</li>
          </ul>
        </div>

        {/* Activity log — full width */}
        <div className="dash-block-full">
          <h2>Recent activity</h2>
          {activities.length === 0 ? (
            <p className="activity-empty">No activity recorded yet — create an opportunity to get started.</p>
          ) : (
            <ul className="activity-feed">
              {activities.map((activity) => (
                <li key={activity.id}>
                  <span className="activity-kind">{activity.kind}</span>
                  <span className="activity-entity">{activity.entityType} · {activity.entityId.slice(0, 8)}</span>
                  <time className="activity-time" dateTime={activity.createdAt.toISOString()}>
                    {activity.createdAt.toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </div>

      </div>
    </>
  );
}
