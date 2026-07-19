"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DraftResponse } from "@/lib/contracts/api";

async function readJson(res: Response) {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error(
      `The server returned an unexpected response (HTTP ${res.status}). Try again in a moment.`,
    );
  }
  if (!res.ok) {
    const message = (body as { error?: { message?: string } })?.error?.message;
    throw new Error(message ?? `Request failed (HTTP ${res.status}).`);
  }
  return body;
}

export function OpportunityActions({
  opportunityId,
  ingestStatus,
}: {
  opportunityId: string;
  ingestStatus: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"reingest" | "generate" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleReingest() {
    setError(null);
    setBusy("reingest");
    try {
      await readJson(
        await fetch(`/api/v1/opportunities/${opportunityId}/reingest`, { method: "POST" }),
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restart ingestion.");
    } finally {
      setBusy(null);
    }
  }

  async function handleGenerate() {
    setError(null);
    setBusy("generate");
    try {
      const draft = (await readJson(
        await fetch("/api/v1/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opportunityId }),
        }),
      )) as DraftResponse;
      router.push(`/dashboard/drafts/${draft.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start draft generation.");
      setBusy(null);
    }
  }

  const canReingest = ingestStatus === "failed" || ingestStatus === "completed";
  const canGenerate = ingestStatus === "completed";
  if (!canReingest && !canGenerate) return null;

  return (
    <>
      {error && <p className="opp-error">{error}</p>}
      <div className="opp-actions">
        {canGenerate && (
          <button className="btn btn-primary" onClick={handleGenerate} disabled={busy !== null}>
            {busy === "generate" ? "Starting…" : "Generate draft"}
          </button>
        )}
        {canReingest && (
          <button
            className={canGenerate ? "btn btn-secondary" : "btn btn-primary"}
            onClick={handleReingest}
            disabled={busy !== null}
          >
            {busy === "reingest" ? "Restarting…" : ingestStatus === "failed" ? "Retry ingestion" : "Re-ingest source"}
          </button>
        )}
      </div>
    </>
  );
}
