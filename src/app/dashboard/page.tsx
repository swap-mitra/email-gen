import { CreateOrganization } from "@clerk/nextjs";
import { listRecentActivities } from "@/lib/activity";
import { getActiveWorkspaceContext } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const context = await getActiveWorkspaceContext();

  if (!context.orgId) {
    return (
      <section className="dashboard-panel dashboard-panel-centered">
        <span className="eyebrow">Workspace required</span>
        <h1>Create your first workspace to enter the application.</h1>
        <p>
          email_gen uses Clerk organizations as the source of truth for workspace isolation.
          Create one organization, then this dashboard will automatically provision the matching
          workspace record in PostgreSQL.
        </p>
        <div className="create-org-frame">
          <CreateOrganization afterCreateOrganizationUrl="/dashboard" skipInvitationScreen />
        </div>
      </section>
    );
  }

  const activities = await listRecentActivities(context.workspace.id, 6);

  return (
    <div className="dashboard-grid">
      <section className="dashboard-panel dashboard-panel-hero">
        <span className="eyebrow">Active workspace</span>
        <h1>{context.workspace.name}</h1>
        <p>
          The signed-in user is operating inside <strong>{context.workspace.slug}</strong> with{" "}
          <strong>{context.membership.role}</strong> access. Sprint 1 establishes the tenancy and
          authorization layer before ingestion and generation workflows land.
        </p>
        <div className="metric-row">
          <article className="metric-card">
            <span>Workspace ID</span>
            <strong>{context.workspace.id}</strong>
          </article>
          <article className="metric-card">
            <span>Clerk organization</span>
            <strong>{context.workspace.clerkOrganizationId}</strong>
          </article>
          <article className="metric-card">
            <span>Member role</span>
            <strong>{context.membership.role}</strong>
          </article>
        </div>
      </section>

      <section className="dashboard-panel">
        <h2>What Sprint 1 added</h2>
        <ul className="stack-list">
          <li>Protected dashboard routes via Clerk middleware</li>
          <li>Workspace bootstrap and membership sync against Clerk organization context</li>
          <li>Typed workspace context API for authenticated clients</li>
          <li>Activity log foundation for auditable workflow events</li>
        </ul>
      </section>

      <section className="dashboard-panel">
        <h2>Recent activity</h2>
        {activities.length === 0 ? (
          <p className="muted-copy">No activity has been recorded for this workspace yet.</p>
        ) : (
          <ul className="activity-list">
            {activities.map((activity) => (
              <li key={activity.id}>
                <strong>{activity.kind}</strong>
                <span>{activity.entityType}</span>
                <time dateTime={activity.createdAt.toISOString()}>
                  {activity.createdAt.toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
