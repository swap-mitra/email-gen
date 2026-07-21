"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OpportunityResponse } from "@/lib/contracts/api";

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

/**
 * Just captures the source URL and hands off — ingestion progress, draft
 * generation, review, and approval all happen on the opportunity/draft pages
 * so that flow lives in one place instead of being duplicated here.
 */
export function NewOpportunityForm() {
  const router = useRouter();
  const [sourceUrl, setSourceUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const created = (await readJson(
        await fetch("/api/v1/opportunities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceUrl }),
        }),
      )) as OpportunityResponse;
      router.push(`/dashboard/opportunities/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create opportunity.");
      setSubmitting(false);
    }
  }

  return (
    <form className="opp-form" onSubmit={handleSubmit}>
      <label className="t-label opp-form-label" htmlFor="new-opp-url">
        Job posting or company URL
      </label>
      <div className="opp-form-row">
        <input
          id="new-opp-url"
          type="url"
          required
          placeholder="https://company.com/careers/job-posting"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          disabled={submitting}
        />
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </div>
      {error && <p className="opp-error">{error}</p>}
    </form>
  );
}
