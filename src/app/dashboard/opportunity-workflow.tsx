"use client";

import { useEffect, useRef, useState } from "react";
import type { DraftResponse, DraftVersionResponse, OpportunityResponse } from "@/lib/contracts/api";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 3 * 60 * 1000;
const MAX_CONSECUTIVE_POLL_FAILURES = 3;

type Phase =
  | "idle"
  | "submitting"
  | "ingesting"
  | "ingest_failed"
  | "ready_to_generate"
  | "generating"
  | "generation_failed"
  | "draft_ready";

const STEPS = ["Submit URL", "Extract opportunity", "Generate draft", "Review & approve"] as const;

function stepIndexForPhase(phase: Phase): number {
  switch (phase) {
    case "idle":
    case "submitting":
      return 0;
    case "ingesting":
    case "ingest_failed":
      return 1;
    case "ready_to_generate":
    case "generating":
    case "generation_failed":
      return 2;
    case "draft_ready":
      return 3;
  }
}

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

/** Human-readable label from a camelCase or snake_case field key. */
function formatFieldKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Flatten extracted fields into displayable [label, value] pairs, skipping nested objects. */
function displayableFields(fields: Record<string, unknown> | null | undefined): [string, string][] {
  if (!fields) return [];
  const pairs: [string, string][] = [];
  for (const [key, value] of Object.entries(fields)) {
    let rendered: string | null = null;
    if (typeof value === "string") rendered = value;
    else if (typeof value === "number" || typeof value === "boolean") rendered = String(value);
    else if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
      rendered = (value as string[]).join(", ");
    }
    if (rendered && rendered.trim().length > 0) {
      pairs.push([formatFieldKey(key), rendered.trim()]);
    }
    if (pairs.length >= 10) break;
  }
  return pairs;
}

export function OpportunityWorkflow() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [sourceUrl, setSourceUrl] = useState("");
  const [opportunity, setOpportunity] = useState<OpportunityResponse | null>(null);
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // True when the failure came from a timeout/connection problem rather than a
  // server-reported failed status — the workflow may still be running, so we
  // offer "Check status" alongside retry.
  const [canResume, setCanResume] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRetryingIngest, setIsRetryingIngest] = useState(false);
  const [approveNote, setApproveNote] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [isSavingRevision, setIsSavingRevision] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
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
    setCanResume(false);
    setDraft(null);
    setPhase("submitting");

    try {
      const res = await fetch("/api/v1/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl }),
      });
      const created = (await readJson(res)) as OpportunityResponse;
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
    const startedAt = Date.now();
    let consecutiveFailures = 0;

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/opportunities/${opportunityId}`);
        const updated = (await readJson(res)) as OpportunityResponse;
        consecutiveFailures = 0;
        setOpportunity(updated);

        if (updated.ingestStatus === "completed") {
          stopPolling();
          setPhase("ready_to_generate");
        } else if (updated.ingestStatus === "failed") {
          stopPolling();
          setCanResume(false);
          setPhase("ingest_failed");
        } else if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          stopPolling();
          setError(
            "Ingestion is taking longer than expected. It may still be running in the background — check the status again in a moment, or retry.",
          );
          setCanResume(true);
          setPhase("ingest_failed");
        }
      } catch (err) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
          stopPolling();
          setError(
            err instanceof Error
              ? `Lost connection while checking ingestion status: ${err.message}`
              : "Lost connection while checking ingestion status.",
          );
          setCanResume(true);
          setPhase("ingest_failed");
        }
      }
    }, POLL_INTERVAL_MS);
  }

  async function handleRetryIngest() {
    if (!opportunity) return;
    setError(null);
    setIsRetryingIngest(true);

    try {
      const res = await fetch(`/api/v1/opportunities/${opportunity.id}/reingest`, {
        method: "POST",
      });
      const updated = (await readJson(res)) as OpportunityResponse;
      setOpportunity(updated);
      setCanResume(false);
      setPhase("ingesting");
      pollOpportunity(updated.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restart ingestion.");
    } finally {
      setIsRetryingIngest(false);
    }
  }

  function handleResumeIngestPolling() {
    if (!opportunity) return;
    setError(null);
    setCanResume(false);
    setPhase("ingesting");
    pollOpportunity(opportunity.id);
  }

  async function handleGenerateDraft() {
    if (!opportunity) return;
    setError(null);
    setCanResume(false);
    setPhase("generating");

    try {
      const res = await fetch("/api/v1/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId: opportunity.id }),
      });
      const created = (await readJson(res)) as DraftResponse;
      setDraft(created);
      pollDraft(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start draft generation.");
      setPhase("ready_to_generate");
    }
  }

  function pollDraft(draftId: string) {
    stopPolling();
    const startedAt = Date.now();
    let consecutiveFailures = 0;

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/drafts/${draftId}`);
        const updated = (await readJson(res)) as DraftResponse;
        consecutiveFailures = 0;
        setDraft(updated);

        if (updated.generationStatus === "completed") {
          stopPolling();
          setPhase("draft_ready");
        } else if (updated.generationStatus === "failed") {
          stopPolling();
          setCanResume(false);
          setPhase("generation_failed");
        } else if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          stopPolling();
          setError(
            "Draft generation is taking longer than expected. It may still be running in the background — check the status again in a moment, or retry.",
          );
          setCanResume(true);
          setPhase("generation_failed");
        }
      } catch (err) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
          stopPolling();
          setError(
            err instanceof Error
              ? `Lost connection while checking draft status: ${err.message}`
              : "Lost connection while checking draft status.",
          );
          setCanResume(true);
          setPhase("generation_failed");
        }
      }
    }, POLL_INTERVAL_MS);
  }

  function handleResumeDraftPolling() {
    if (!draft) return;
    setError(null);
    setCanResume(false);
    setPhase("generating");
    pollDraft(draft.id);
  }

  function handleStartEditing() {
    if (!draft?.latestVersion) return;
    setEditSubject(draft.latestVersion.subject);
    setEditBody(draft.latestVersion.body);
    setIsEditing(true);
    setError(null);
  }

  async function handleSaveRevision(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setError(null);
    setIsSavingRevision(true);

    try {
      const res = await fetch(`/api/v1/drafts/${draft.id}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: editSubject, body: editBody }),
      });
      const version = (await readJson(res)) as DraftVersionResponse;
      setDraft({ ...draft, state: "draft_reviewed", latestVersion: version });
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the revision.");
    } finally {
      setIsSavingRevision(false);
    }
  }

  async function handleApprove() {
    if (!draft) return;
    setError(null);
    setIsApproving(true);

    try {
      const note = approveNote.trim();
      const res = await fetch(`/api/v1/drafts/${draft.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(note ? { note } : {}),
      });
      await readJson(res);
      setDraft({ ...draft, state: "approved_for_send" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve draft.");
    } finally {
      setIsApproving(false);
    }
  }

  async function handleCopyDraft() {
    if (!draft?.latestVersion) return;
    try {
      await navigator.clipboard.writeText(
        `Subject: ${draft.latestVersion.subject}\n\n${draft.latestVersion.body}`,
      );
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not access the clipboard. Select the draft text and copy it manually.");
    }
  }

  function handleReset() {
    stopPolling();
    setPhase("idle");
    setSourceUrl("");
    setOpportunity(null);
    setDraft(null);
    setError(null);
    setCanResume(false);
    setIsEditing(false);
    setApproveNote("");
    setCopied(false);
  }

  const stepIndex = stepIndexForPhase(phase);
  const stepFailed = phase === "ingest_failed" || phase === "generation_failed";
  const extractedFields = displayableFields(opportunity?.normalizedFields);
  const latestVersion = draft?.latestVersion ?? null;
  const isApproved = draft?.state === "approved_for_send";

  return (
    <div className="opp-workflow">
      {/* ── Stepper ──────────────────────────────────────────────── */}
      <ol className="opp-steps" aria-label="Workflow progress">
        {STEPS.map((label, i) => {
          const state =
            i < stepIndex ? "done" : i === stepIndex ? (stepFailed ? "failed" : "current") : "upcoming";
          return (
            <li
              key={label}
              className={`opp-step opp-step-${state}`}
              aria-current={i === stepIndex ? "step" : undefined}
            >
              <span className="opp-step-index">{i < stepIndex ? "✓" : i + 1}</span>
              {label}
            </li>
          );
        })}
      </ol>

      {phase === "idle" || phase === "submitting" ? (
        <form className="opp-form" onSubmit={handleSubmit}>
          <label className="t-label opp-form-label" htmlFor="opp-source-url">
            Job posting or company URL
          </label>
          <div className="opp-form-row">
            <input
              id="opp-source-url"
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
          </div>
        </form>
      ) : (
        <div className="opp-status" role="status" aria-live="polite">
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
              {phase === "ingesting" && (
                <span className="opp-working" aria-hidden="true" />
              )}
              {opportunity && opportunity.ingestAttempts > 1 && (
                <span className="t-mono opp-attempts">attempt {opportunity.ingestAttempts}</span>
              )}
            </div>
          )}

          {phase === "ingesting" && (
            <p className="opp-hint">
              Fetching the page and extracting opportunity details — this usually takes under a minute.
            </p>
          )}

          {phase === "ingest_failed" && (
            <>
              <p className="opp-error">
                {error ?? opportunity?.ingestError ?? "Ingestion failed."}
              </p>
              <div className="opp-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleRetryIngest}
                  disabled={isRetryingIngest}
                >
                  {isRetryingIngest ? "Restarting…" : "Retry ingestion"}
                </button>
                {canResume && (
                  <button className="btn btn-secondary" onClick={handleResumeIngestPolling}>
                    Check status
                  </button>
                )}
              </div>
            </>
          )}

          {/* Extracted fields — visible once ingestion has completed */}
          {(phase === "ready_to_generate" ||
            phase === "generating" ||
            phase === "generation_failed" ||
            phase === "draft_ready") &&
            extractedFields.length > 0 && (
              <div className="opp-fields">
                <p className="t-label opp-fields-title">Extracted opportunity</p>
                <dl className="opp-fields-grid">
                  {extractedFields.map(([label, value]) => (
                    <div className="opp-field" key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

          {phase === "ready_to_generate" && (
            <div className="opp-actions">
              <button className="btn btn-primary" onClick={handleGenerateDraft}>
                Generate draft
              </button>
            </div>
          )}

          {(phase === "generating" || phase === "draft_ready" || phase === "generation_failed") && (
            <div className="opp-status-row">
              <span className="t-label">Draft generation</span>
              <span className={`opp-badge opp-badge-${draft?.generationStatus}`}>
                {draft?.generationStatus}
              </span>
              {phase === "generating" && <span className="opp-working" aria-hidden="true" />}
            </div>
          )}

          {phase === "generating" && (
            <p className="opp-hint">
              Retrieving workspace knowledge and drafting a grounded email — hang tight.
            </p>
          )}

          {phase === "generation_failed" && (
            <>
              <p className="opp-error">
                {error ?? draft?.generationError ?? "Draft generation failed."}
              </p>
              <div className="opp-actions">
                <button className="btn btn-primary" onClick={handleGenerateDraft}>
                  Retry generation
                </button>
                {canResume && draft && (
                  <button className="btn btn-secondary" onClick={handleResumeDraftPolling}>
                    Check status
                  </button>
                )}
              </div>
            </>
          )}

          {phase === "draft_ready" && !latestVersion && (
            <>
              <p className="opp-error">
                Generation finished but no draft content was returned. Retry the generation.
              </p>
              <div className="opp-actions">
                <button className="btn btn-primary" onClick={handleGenerateDraft}>
                  Retry generation
                </button>
              </div>
            </>
          )}

          {phase === "draft_ready" && latestVersion && (
            <div className="opp-draft">
              <div className="opp-draft-meta">
                <span className="opp-badge">v{latestVersion.versionNumber}</span>
                <span className="opp-badge">
                  {latestVersion.source === "human_revised" ? "edited" : "AI generated"}
                </span>
                {latestVersion.groundingRefs.length > 0 && (
                  <span className="t-mono opp-grounding">
                    grounded in {latestVersion.groundingRefs.length} knowledge item
                    {latestVersion.groundingRefs.length === 1 ? "" : "s"}
                  </span>
                )}
                {isApproved && <span className="opp-badge opp-badge-completed">Approved</span>}
              </div>

              {isEditing ? (
                <form className="opp-edit-form" onSubmit={handleSaveRevision}>
                  <label className="t-label" htmlFor="opp-edit-subject">
                    Subject
                  </label>
                  <input
                    id="opp-edit-subject"
                    type="text"
                    required
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    disabled={isSavingRevision}
                  />
                  <label className="t-label" htmlFor="opp-edit-body">
                    Body
                  </label>
                  <textarea
                    id="opp-edit-body"
                    required
                    rows={10}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    disabled={isSavingRevision}
                  />
                  <div className="opp-actions">
                    <button type="submit" className="btn btn-primary" disabled={isSavingRevision}>
                      {isSavingRevision ? "Saving…" : "Save revision"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setIsEditing(false)}
                      disabled={isSavingRevision}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="opp-draft-subject">{latestVersion.subject}</div>
                  <div className="opp-draft-body">{latestVersion.body}</div>

                  {!isApproved && (
                    <div className="opp-approve">
                      <label className="t-label" htmlFor="opp-approve-note">
                        Reviewer note (optional)
                      </label>
                      <input
                        id="opp-approve-note"
                        type="text"
                        placeholder="Looks good — personalize the first line before sending."
                        value={approveNote}
                        onChange={(e) => setApproveNote(e.target.value)}
                        disabled={isApproving}
                      />
                    </div>
                  )}

                  <div className="opp-draft-actions">
                    {!isApproved && (
                      <button className="btn btn-primary" onClick={handleApprove} disabled={isApproving}>
                        {isApproving ? "Approving…" : "Approve draft"}
                      </button>
                    )}
                    {!isApproved && (
                      <button className="btn btn-secondary" onClick={handleStartEditing}>
                        Edit draft
                      </button>
                    )}
                    <button className="btn btn-secondary" onClick={handleCopyDraft}>
                      {copied ? "Copied ✓" : "Copy to clipboard"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          <button className="btn btn-ghost opp-reset" onClick={handleReset}>
            Start another opportunity
          </button>
        </div>
      )}

      {/* Errors outside the failed phases (submit, approve, revise, clipboard) */}
      {error && phase !== "ingest_failed" && phase !== "generation_failed" && (
        <p className="opp-error">{error}</p>
      )}
    </div>
  );
}
