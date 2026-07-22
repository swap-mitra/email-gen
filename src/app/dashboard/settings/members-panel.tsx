"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

const ROLES = ["member", "admin"] as const;

export function MembersPanel({
  isAdmin,
  currentUserId,
}: {
  isAdmin: boolean;
  currentUserId: string;
}) {
  const { data: organization, isPending } = authClient.useActiveOrganization();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<(typeof ROLES)[number]>("member");
  const [isInviting, setIsInviting] = useState(false);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [busyInvitationId, setBusyInvitationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsInviting(true);
    const { error: inviteError } = await authClient.organization.inviteMember({
      email: inviteEmail.trim(),
      role: inviteRole,
    });
    if (inviteError) {
      setError(inviteError.message ?? "Failed to send the invitation.");
    } else {
      setInviteEmail("");
    }
    setIsInviting(false);
  }

  async function handleRoleChange(memberId: string, role: string) {
    setError(null);
    setBusyMemberId(memberId);
    const { error: roleError } = await authClient.organization.updateMemberRole({
      memberId,
      role,
    });
    if (roleError) setError(roleError.message ?? "Failed to update the role.");
    setBusyMemberId(null);
  }

  async function handleRemove(memberId: string) {
    if (!window.confirm("Remove this member from the workspace?")) return;
    setError(null);
    setBusyMemberId(memberId);
    const { error: removeError } = await authClient.organization.removeMember({
      memberIdOrEmail: memberId,
    });
    if (removeError) setError(removeError.message ?? "Failed to remove the member.");
    setBusyMemberId(null);
  }

  async function handleCancelInvitation(invitationId: string) {
    setError(null);
    setBusyInvitationId(invitationId);
    const { error: cancelError } = await authClient.organization.cancelInvitation({
      invitationId,
    });
    if (cancelError) setError(cancelError.message ?? "Failed to cancel the invitation.");
    setBusyInvitationId(null);
  }

  if (isPending || !organization) {
    return <p className="empty-state">Loading members…</p>;
  }

  const pendingInvitations = organization.invitations.filter((inv) => inv.status === "pending");

  return (
    <div>
      {error && <p className="opp-error">{error}</p>}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              {isAdmin && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {organization.members.map((m) => (
              <tr key={m.id}>
                <td className="cell-title">{m.user.name ?? m.user.email}</td>
                <td>
                  {isAdmin && m.role !== "owner" ? (
                    <select
                      value={m.role}
                      disabled={busyMemberId === m.id}
                      onChange={(e) => handleRoleChange(m.id, e.target.value)}
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="opp-badge">{m.role}</span>
                  )}
                </td>
                {isAdmin && (
                  <td>
                    {m.role !== "owner" && m.userId !== currentUserId && (
                      <button
                        className="btn btn-danger"
                        disabled={busyMemberId === m.id}
                        onClick={() => handleRemove(m.id)}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <>
          {pendingInvitations.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Pending invitation</th>
                    <th>Role</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingInvitations.map((inv) => (
                    <tr key={inv.id}>
                      <td className="cell-title">{inv.email}</td>
                      <td>
                        <span className="opp-badge">{inv.role}</span>
                      </td>
                      <td>
                        <button
                          className="btn btn-danger"
                          disabled={busyInvitationId === inv.id}
                          onClick={() => handleCancelInvitation(inv.id)}
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <form className="opp-edit-form" onSubmit={handleInvite} style={{ marginTop: 16 }}>
            <label className="t-label" htmlFor="invite-email">
              Invite by email
            </label>
            <input
              id="invite-email"
              type="email"
              required
              placeholder="teammate@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              disabled={isInviting}
            />
            <label className="t-label" htmlFor="invite-role">
              Role
            </label>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as (typeof ROLES)[number])}
              disabled={isInviting}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <div className="opp-actions">
              <button type="submit" className="btn btn-primary" disabled={isInviting}>
                {isInviting ? "Sending…" : "Send invitation"}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
