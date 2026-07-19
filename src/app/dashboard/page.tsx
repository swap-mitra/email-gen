import { CreateOrganization } from "@clerk/nextjs";
import { listRecentActivities } from "@/lib/activity";
import { getActiveWorkspaceContext } from "@/lib/workspaces";
import { OpportunityWorkflow } from "./opportunity-workflow";

export const dynamic = "force-dynamic";

const ACTIVITY_LABELS: Record<string, string> = {
  "workspace.provisioned": "Workspace provisioned",
  "opportunity.created": "Opportunity created",
  "opportunity.reingest_requested": "Ingestion retry requested",
  "opportunity.ingest_started": "Ingestion started",
  "opportunity.ingest_completed": "Ingestion completed",
  "opportunity.ingest_failed": "Ingestion failed",
  "opportunity.browser_fallback_used": "Browser fallback used",
  "opportunity.browser_fallback_failed": "Browser fallback failed",
  "opportunity.browser_fallback_skipped": "Browser fallback skipped",
  "opportunity.ai_extraction_skipped": "AI extraction skipped",
  "knowledge_item.created": "Knowledge item added",
  "knowledge_item.embedded": "Knowledge item embedded",
  "knowledge_item.embedding_failed": "Knowledge embedding failed",
  "knowledge_item.embedding_skipped": "Knowledge embedding skipped",
  "draft.created": "Draft created",
  "draft.generation_started": "Draft generation started",
  "draft.generation_completed": "Draft generated",
  "draft.generation_failed": "Draft generation failed",
  "draft.revised": "Draft revised",
  "draft.approved": "Draft approved",
};

function formatActivityKind(kind: string): string {
  return ACTIVITY_LABELS[kind] ?? kind.replaceAll("_", " ").replace(".", " · ");
}


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

        {/* Quick-start */}
        <div className="dash-block">
          <h2>Get started</h2>
          <ul className="feature-list">
            <li>Submit a job or company URL to create your first opportunity</li>
            <li>Ground the message in your team&apos;s proof points and knowledge</li>
            <li>Review and approve drafts before they go out</li>
            <li>Track every action in the activity log below</li>
          </ul>
        </div>

        {/* Workspace info */}
        <div className="dash-block">
          <h2>Workspace</h2>
          <ul className="feature-list">
            <li>Isolated tenant — all data scoped to your organization</li>
            <li>Role-based access — invite teammates and assign reviewers</li>
            <li>Full audit trail tied to every draft and approval</li>
          </ul>
        </div>

        {/* New opportunity — full width */}
        <div className="dash-block-full">
          <h2>New opportunity</h2>
          <OpportunityWorkflow />
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
                  <span className="activity-kind">{formatActivityKind(activity.kind)}</span>
                  <span className="activity-entity" title={activity.entityId}>
                    {activity.entityType} · {activity.entityId.slice(0, 8)}
                  </span>
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
