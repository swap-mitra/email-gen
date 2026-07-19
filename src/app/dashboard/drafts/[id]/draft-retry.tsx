"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DraftResponse } from "@/lib/contracts/api";

export function DraftRetry({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRetry() {
    setError(null);
    setIsStarting(true);
    try {
      const res = await fetch("/api/v1/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (body as { error?: { message?: string } })?.error?.message ??
            `Request failed (HTTP ${res.status}).`,
        );
      }
      const draft = body as DraftResponse;
      router.push(`/dashboard/drafts/${draft.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start a new generation.");
      setIsStarting(false);
    }
  }

  return (
    <>
      {error && <p className="opp-error">{error}</p>}
      <div className="opp-actions">
        <button className="btn btn-primary" onClick={handleRetry} disabled={isStarting}>
          {isStarting ? "Starting…" : "Retry generation"}
        </button>
      </div>
    </>
  );
}
