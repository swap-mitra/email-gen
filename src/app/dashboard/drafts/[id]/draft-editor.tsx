"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { DraftVersionResponse, ExportDraftResponse } from "@/lib/contracts/api";

type VersionView = {
  versionNumber: number;
  subject: string;
  body: string;
  source: string;
  createdAt: string;
};

type EvidenceItem = {
  id: string;
  title: string;
  content: string;
};

type ExportView = {
  status: string;
  error: string | null;
  externalAccountEmail: string | null;
};

// Gmail export needs the Google Cloud OAuth client set up (GOOGLE_CLIENT_ID/
// GOOGLE_CLIENT_SECRET, gmail.compose scope, Gmail API enabled — see the
// README) before it can work — keep the button visible but disabled until
// that's done.
const GMAIL_EXPORT_DISABLED = true;

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

export function DraftEditor({
  draftId,
  state,
  initialVersion,
  evidence,
  initialExport,
}: {
  draftId: string;
  state: string;
  initialVersion: VersionView;
  evidence: EvidenceItem[];
  initialExport: ExportView | null;
}) {
  const router = useRouter();
  const [version, setVersion] = useState<VersionView>(initialVersion);
  const [isApproved, setIsApproved] = useState(state === "approved_for_send");
  const [isEditing, setIsEditing] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [approveNote, setApproveNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(initialExport?.status ?? null);
  const [exportedEmail, setExportedEmail] = useState<string | null>(
    initialExport?.externalAccountEmail ?? null,
  );
  const [copied, setCopied] = useState(false);
  // A previous export that failed is otherwise invisible — the only export
  // feedback below is gated on "completed".
  const [error, setError] = useState<string | null>(
    initialExport?.status === "failed"
      ? (initialExport.error ?? "The last Gmail export failed.")
      : null,
  );
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  function handleStartEditing() {
    setEditSubject(version.subject);
    setEditBody(version.body);
    setIsEditing(true);
    setError(null);
  }

  async function handleSaveRevision(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      const saved = (await readJson(
        await fetch(`/api/v1/drafts/${draftId}/revise`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject: editSubject, body: editBody }),
        }),
      )) as DraftVersionResponse;
      setVersion({
        versionNumber: saved.versionNumber,
        subject: saved.subject,
        body: saved.body,
        source: saved.source,
        createdAt: new Date(saved.createdAt).toISOString(),
      });
      setIsEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the revision.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleApprove() {
    setError(null);
    setIsApproving(true);

    try {
      const note = approveNote.trim();
      await readJson(
        await fetch(`/api/v1/drafts/${draftId}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(note ? { note } : {}),
        }),
      );
      setIsApproved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve draft.");
    } finally {
      setIsApproving(false);
    }
  }

  async function handleExport() {
    setError(null);
    setIsExporting(true);

    try {
      const exported = (await readJson(
        await fetch(`/api/v1/drafts/${draftId}/export`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
      )) as ExportDraftResponse;
      setExportStatus("completed");
      setExportedEmail(exported.externalAccountEmail);
      router.refresh();
    } catch (err) {
      setExportStatus("failed");
      setError(err instanceof Error ? err.message : "Failed to export draft to Gmail.");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`Subject: ${version.subject}\n\n${version.body}`);
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not access the clipboard. Select the draft text and copy it manually.");
    }
  }

  return (
    <div className="editor-grid">
      {/* ── Draft content ─────────────────────────────────────────── */}
      <div className="opp-draft">
        <div className="opp-draft-meta">
          <span className="opp-badge">v{version.versionNumber}</span>
          <span className="opp-badge">
            {version.source === "human_revised" ? "edited" : "AI generated"}
          </span>
          {isApproved && <span className="opp-badge opp-badge-completed">Approved</span>}
        </div>

        {isEditing ? (
          <form className="opp-edit-form" onSubmit={handleSaveRevision}>
            <label className="t-label" htmlFor="draft-subject">
              Subject
            </label>
            <input
              id="draft-subject"
              type="text"
              required
              value={editSubject}
              onChange={(e) => setEditSubject(e.target.value)}
              disabled={isSaving}
            />
            <label className="t-label" htmlFor="draft-body">
              Body
            </label>
            <textarea
              id="draft-body"
              required
              rows={14}
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              disabled={isSaving}
            />
            <div className="opp-actions">
              <button type="submit" className="btn btn-primary" disabled={isSaving}>
                {isSaving ? "Saving…" : "Save revision"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="opp-draft-subject">{version.subject}</div>
            <div className="opp-draft-body">{version.body}</div>

            {!isApproved && (
              <div className="opp-approve">
                <label className="t-label" htmlFor="draft-approve-note">
                  Reviewer note (optional)
                </label>
                <input
                  id="draft-approve-note"
                  type="text"
                  placeholder="Looks good — personalize the first line before sending."
                  value={approveNote}
                  onChange={(e) => setApproveNote(e.target.value)}
                  disabled={isApproving}
                />
              </div>
            )}

            {isApproved && exportStatus === "completed" && (
              <p className="opp-hint">
                {exportedEmail
                  ? `Exported to Gmail (${exportedEmail}) — open Gmail to review and send it.`
                  : "Exported to Gmail — open Gmail to review and send it."}
              </p>
            )}

            {error && <p className="opp-error">{error}</p>}

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
              {isApproved && (
                <button
                  className="btn btn-secondary"
                  onClick={handleExport}
                  // Gated off until the Google Cloud OAuth client is set up
                  // (see README) — remove the GMAIL_EXPORT_DISABLED check to
                  // turn this back on.
                  disabled={GMAIL_EXPORT_DISABLED || isExporting}
                  title={GMAIL_EXPORT_DISABLED ? "Gmail export support coming soon" : undefined}
                >
                  {isExporting
                    ? "Exporting…"
                    : exportStatus === "completed"
                      ? "Re-export to Gmail"
                      : "Export to Gmail"}
                </button>
              )}
              <button className="btn btn-secondary" onClick={handleCopy}>
                {copied ? "Copied ✓" : "Copy to clipboard"}
              </button>
            </div>
          </>
        )}
        {isEditing && error && <p className="opp-error">{error}</p>}
      </div>

      {/* ── Evidence panel ────────────────────────────────────────── */}
      <aside className="evidence-panel">
        <h2 className="block-title">Evidence</h2>
        {evidence.length === 0 ? (
          <p className="empty-state">
            This version cites no knowledge items.
            {version.source === "human_revised"
              ? " Human revisions do not carry grounding references."
              : " Add workspace knowledge so future drafts can ground their claims."}
          </p>
        ) : (
          <>
            <p className="opp-hint">
              Knowledge items retrieved and cited when this draft was generated.
            </p>
            {evidence.map((item) => (
              <details className="evidence-item" key={item.id}>
                <summary>{item.title}</summary>
                <p>{item.content}</p>
              </details>
            ))}
          </>
        )}
      </aside>
    </div>
  );
}
