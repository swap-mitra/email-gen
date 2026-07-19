"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function QuickApprove({ draftId }: { draftId: string }) {
  const router = useRouter();
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setError(null);
    setIsApproving(true);
    try {
      const res = await fetch(`/api/v1/drafts/${draftId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (body as { error?: { message?: string } })?.error?.message ??
            `Request failed (HTTP ${res.status}).`,
        );
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve draft.");
      setIsApproving(false);
    }
  }

  return (
    <div className="quick-approve">
      <button className="btn btn-compact" onClick={handleApprove} disabled={isApproving}>
        {isApproving ? "Approving…" : "Approve"}
      </button>
      {error && <p className="opp-error">{error}</p>}
    </div>
  );
}
