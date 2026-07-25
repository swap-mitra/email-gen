import { redirect } from "next/navigation";
import { LocalTime } from "@/components/local-time";
import { getActiveWorkspaceContext } from "@/lib/workspaces";
import { MembersPanel } from "./members-panel";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const context = await getActiveWorkspaceContext();
  if (!context.workspace) redirect("/dashboard");

  const isAdmin = context.membership.role === "owner" || context.membership.role === "admin";

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
            <dd>
              <LocalTime value={context.workspace.createdAt} />
            </dd>
          </div>
        </dl>
      </div>

      <div className="dash-block-card">
        <h2 className="block-title">Members &amp; organization</h2>
        <p className="opp-hint">
          {isAdmin
            ? "Manage roles, invite teammates, and remove members. Changes here apply to everyone in this workspace."
            : "Only workspace admins can manage members and invitations."}
        </p>
        <MembersPanel isAdmin={isAdmin} currentUserId={context.userId} />
      </div>
    </>
  );
}
