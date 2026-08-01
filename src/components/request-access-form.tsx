"use client";

import { useState } from "react";

export function RequestAccessForm() {
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSending(true);

    try {
      const res = await fetch("/api/v1/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? `Request failed (HTTP ${res.status}).`);
      }

      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your request.");
    } finally {
      setIsSending(false);
    }
  }

  if (sent) {
    return (
      <p className="opp-hint">
        Thanks — your request is with the admin. You&apos;ll hear back at {email}.
      </p>
    );
  }

  return (
    <form className="request-access-form" onSubmit={handleSubmit}>
      <label className="t-label" htmlFor="access-email">
        Work email
      </label>
      <div className="request-access-row">
        <input
          id="access-email"
          type="email"
          required
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isSending}
        />
        <button type="submit" className="btn btn-secondary" disabled={isSending}>
          {isSending ? "Sending…" : "Request access"}
        </button>
      </div>
      {error && <p className="opp-error">{error}</p>}
    </form>
  );
}
