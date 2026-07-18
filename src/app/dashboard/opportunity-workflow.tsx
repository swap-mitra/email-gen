"use client";

import { useEffect, useRef, useState } from "react";
import type { OpportunityResponse, DraftResponse } from "@/lib/contracts/api";

const POLL_INTERVAL_MS = 2000;

type Phase = "idle" | "submitting" | "ingesting" | "ingest_failed" | "ready_to_generate" | "generating" | "generation_failed" | "draft_ready";

async function readJson(res: Response) {
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error?.message ?? "Request failed.");
  }
  return body;
}

export function OpportunityWorkflow() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [sourceUrl, setSourceUrl] = useState("");
  const [opportunity, setOpportunity] = useState<OpportunityResponse | null>(null);
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDraft(null);
    setPhase("submitting");

    try {
      const res = await fetch("/api/v1/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl }),
      });
      const created: OpportunityResponse = await readJson(res);
      setOpportunity(created);
      setPhase("ingesting");
      pollOpportunity(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create opportunity.");
      setPhase("idle");
    }
  }

  function pollOpportunity(opportunityId: string) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/opportunities/${opportunityId}`);
        const updated: OpportunityResponse = await readJson(res);
        setOpportunity(updated);

        if (updated.ingestStatus === "completed") {
          stopPolling();
          setPhase("ready_to_generate");
        } else if (updated.ingestStatus === "failed") {
          stopPolling();
          setPhase("ingest_failed");
        }
      } catch (err) {
        stopPolling();
        setError(err instanceof Error ? err.message : "Failed to check ingestion status.");
        setPhase("ingest_failed");
      }
    }, POLL_INTERVAL_MS);
  }

  async function handleGenerateDraft() {
    if (!opportunity) return;
    setError(null);
    setPhase("generating");

    try {
      const res = await fetch("/api/v1/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId: opportunity.id }),
      });
      const created: DraftResponse = await readJson(res);
      setDraft(created);
      pollDraft(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start draft generation.");
      setPhase("ready_to_generate");
    }
  }

  function pollDraft(draftId: string) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/drafts/${draftId}`);
        const updated: DraftResponse = await readJson(res);
        setDraft(updated);

        if (updated.generationStatus === "completed") {
          stopPolling();
          setPhase("draft_ready");
        } else if (updated.generationStatus === "failed") {
          stopPolling();
          setPhase("generation_failed");
        }
      } catch (err) {
        stopPolling();
        setError(err instanceof Error ? err.message : "Failed to check draft status.");
        setPhase("generation_failed");
      }
    }, POLL_INTERVAL_MS);
  }

  async function handleApprove() {
    if (!draft) return;
    setError(null);

    try {
      const res = await fetch(`/api/v1/drafts/${draft.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await readJson(res);
      setDraft({ ...draft, state: "approved_for_send" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve draft.");
    }
  }

  function handleReset() {
    stopPolling();
    setPhase("idle");
    setSourceUrl("");
    setOpportunity(null);
    setDraft(null);
    setError(null);
  }

  return (
    <div className="opp-workflow">
      {phase === "idle" || phase === "submitting" ? (
        <form className="opp-form" onSubmit={handleSubmit}>
          <input
            type="url"
            required
            placeholder="https://company.com/careers/job-posting"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            disabled={phase === "submitting"}
          />
          <button type="submit" className="btn btn-primary" disabled={phase === "submitting"}>
            {phase === "submitting" ? "Submitting…" : "Submit URL"}
          </button>
        </form>
      ) : (
        <div className="opp-status">
          <div className="opp-status-row">
            <span className="t-label">Source</span>
            <span className="t-mono opp-status-url">{opportunity?.sourceUrl}</span>
          </div>

          {(phase === "ingesting" || phase === "ready_to_generate" || phase === "ingest_failed") && (
            <div className="opp-status-row">
              <span className="t-label">Ingestion</span>
              <span className={`opp-badge opp-badge-${opportunity?.ingestStatus}`}>
                {opportunity?.ingestStatus}
              </span>
            </div>
          )}

          {phase === "ingest_failed" && (
            <p className="opp-error">{opportunity?.ingestError ?? "Ingestion failed."}</p>
          )}

          {phase === "ready_to_generate" && (
            <button className="btn btn-primary" onClick={handleGenerateDraft}>
              Generate Draft
            </button>
          )}

          {(phase === "generating" || phase === "draft_ready" || phase === "generation_failed") && (
            <div className="opp-status-row">
              <span className="t-label">Draft generation</span>
              <span className={`opp-badge opp-badge-${draft?.generationStatus}`}>
                {draft?.generationStatus}
              </span>
            </div>
          )}

          {phase === "generation_failed" && (
            <p className="opp-error">{draft?.generationError ?? "Draft generation failed."}</p>
          )}

          {phase === "draft_ready" && draft?.latestVersion && (
            <div className="opp-draft">
              <div className="opp-draft-subject">{draft.latestVersion.subject}</div>
              <div className="opp-draft-body">{draft.latestVersion.body}</div>
              <div className="opp-draft-actions">
                {draft.state === "approved_for_send" ? (
                  <span className="opp-badge opp-badge-completed">Approved</span>
                ) : (
                  <button className="btn btn-primary" onClick={handleApprove}>
                    Approve Draft
                  </button>
                )}
              </div>
            </div>
          )}

          <button className="btn btn-ghost opp-reset" onClick={handleReset}>
            Submit another URL
          </button>
        </div>
      )}

      {error && <p className="opp-error">{error}</p>}
    </div>
  );
}
