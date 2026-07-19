"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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

export function KnowledgeForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      const meta = sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : undefined;
      const res = await fetch("/api/v1/knowledge-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content: content.trim(), meta }),
      });
      await readJson(res);
      setTitle("");
      setContent("");
      setSourceUrl("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the knowledge item.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="k-form" onSubmit={handleSubmit}>
      <label className="t-label" htmlFor="k-title">
        Title
      </label>
      <input
        id="k-title"
        type="text"
        required
        placeholder="Case study: 40% reply-rate lift for Acme"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={isSaving}
      />

      <label className="t-label" htmlFor="k-content">
        Content
      </label>
      <textarea
        id="k-content"
        required
        rows={6}
        placeholder="The proof point, case study, or product fact in full — this text is what gets retrieved and cited in drafts."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={isSaving}
      />

      <label className="t-label" htmlFor="k-source">
        Source URL (optional)
      </label>
      <input
        id="k-source"
        type="url"
        placeholder="https://yoursite.com/case-studies/acme"
        value={sourceUrl}
        onChange={(e) => setSourceUrl(e.target.value)}
        disabled={isSaving}
      />

      {error && <p className="opp-error">{error}</p>}

      <div className="opp-actions">
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          {isSaving ? "Saving…" : "Add knowledge item"}
        </button>
      </div>
    </form>
  );
}
