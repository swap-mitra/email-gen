import { CreateOrganization } from "@clerk/nextjs";
import Link from "next/link";
import { listRecentActivities } from "@/lib/activity";
import { formatActivityKind } from "@/lib/labels";
import { getActiveWorkspaceContext } from "@/lib/workspaces";
import { OpportunityWorkflow } from "./opportunity-workflow";

export const dynamic = "force-dynamic";


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
            <li>Submit a job or company URL below to create your first opportunity</li>
            <li>
              Ground the message in your team&apos;s proof points — add them in the{" "}
              <Link href="/dashboard/knowledge">knowledge hub</Link>
            </li>
            <li>
              Review and approve drafts in the <Link href="/dashboard/approvals">approval queue</Link>
            </li>
            <li>
              Track every opportunity on the{" "}
              <Link href="/dashboard/opportunities">opportunities page</Link>
            </li>
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
