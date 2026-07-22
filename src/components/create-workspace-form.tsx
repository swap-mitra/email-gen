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

export function CreateWorkspaceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <form className="opp-edit-form" onSubmit={handleSubmit}>
      <label className="t-label" htmlFor="workspace-name">
        Workspace name
      </label>
      <input
        id="workspace-name"
        type="text"
        required
        placeholder="Acme Sales"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={isCreating}
      />
      {error && <p className="opp-error">{error}</p>}
      <div className="opp-actions">
        <button type="submit" className="btn btn-primary" disabled={isCreating}>
          {isCreating ? "Creating…" : "Create workspace"}
        </button>
      </div>
    </form>
  );
}
