import { OrganizationProfile } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { formatDateTime } from "@/lib/labels";
import { getActiveWorkspaceContext } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const context = await getActiveWorkspaceContext();
  if (!context.workspace) redirect("/dashboard");

  return (
    <>
      <div className="page-head">
        <div>
          <p className="t-label page-kicker">Workspace settings</p>
          <h1 className="page-title">{context.workspace.name}</h1>
        </div>
      </div>

      <div className="dash-block-card">
        <h2 className="block-title">Workspace record</h2>
        <dl className="opp-fields-grid settings-facts">
          <div className="opp-field">
            <dt>Workspace ID</dt>
            <dd className="t-mono">{context.workspace.id}</dd>
          </div>
          <div className="opp-field">
            <dt>Org slug</dt>
            <dd className="t-mono">{context.workspace.slug}</dd>
          </div>
          <div className="opp-field">
            <dt>Your role</dt>
            <dd className="t-mono">{context.membership.role}</dd>
          </div>
          <div className="opp-field">
            <dt>Created</dt>
            <dd>{formatDateTime(context.workspace.createdAt)}</dd>
          </div>
        </dl>
      </div>

      <div className="dash-block-card">
        <h2 className="block-title">Members &amp; organization</h2>
        <p className="opp-hint">
          Invitations, roles, and organization details are managed through Clerk. Changes here apply
          to everyone in this workspace.
        </p>
        <div className="org-profile-wrap">
          <OrganizationProfile routing="hash" />
        </div>
      </div>
    </>
  );
}
