"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function CreateWorkspaceForm({
  existing = [],
}: {
  existing?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [pendingOrgId, setPendingOrgId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleOpen(organizationId: string) {
    setError(null);
    setPendingOrgId(organizationId);

    const { error: setActiveError } = await authClient.organization.setActive({ organizationId });
    if (setActiveError) {
      setError(setActiveError.message ?? "Could not open that workspace.");
      setPendingOrgId(null);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsCreating(true);

    const trimmed = name.trim();
    const { data, error: createError } = await authClient.organization.create({
      name: trimmed,
      slug: slugify(trimmed),
    });

    if (createError || !data) {
      setError(createError?.message ?? "Failed to create workspace.");
      setIsCreating(false);
      return;
    }

    await authClient.organization.setActive({ organizationId: data.id });
    router.push("/dashboard");
    router.refresh();
  }

  const isBusy = isCreating || pendingOrgId !== null;

  return (
    <>
      {existing.length > 0 && (
        <ul className="workspace-choices">
          {existing.map((org) => (
            <li key={org.id}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleOpen(org.id)}
                disabled={isBusy}
              >
                {pendingOrgId === org.id ? "Opening…" : org.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="opp-edit-form" onSubmit={handleSubmit}>
        <label className="t-label" htmlFor="workspace-name">
          {existing.length > 0 ? "Or create a new workspace" : "Workspace name"}
        </label>
        <input
          id="workspace-name"
          type="text"
          required
          placeholder="Acme Sales"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isBusy}
        />
        {error && <p className="opp-error">{error}</p>}
        <div className="opp-actions">
          <button type="submit" className="btn btn-primary" disabled={isBusy}>
            {isCreating ? "Creating…" : "Create workspace"}
          </button>
        </div>
      </form>
    </>
  );
}
