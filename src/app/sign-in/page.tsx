"use client";

import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { authClient } from "@/lib/auth-client";
import { callbackTarget } from "./callback-target";

export default function SignInPage() {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setError(null);
    setIsSigningIn(true);
    try {
      // Read at click time rather than via useSearchParams() — keeps this page
      // statically renderable without a Suspense boundary.
      const callbackURL = callbackTarget(window.location.search);
      await authClient.signIn.social({ provider: "google", callbackURL });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start Google sign-in.");
      setIsSigningIn(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-theme-toggle">
        <ThemeToggle />
      </div>
      <div className="auth-card">
        <h1 className="page-title">Sign in</h1>
        <p className="page-intro">
          Sign in with the Google account you want to use — the same account is used later for
          Gmail draft export.
        </p>
        <button className="btn btn-primary" onClick={handleSignIn} disabled={isSigningIn}>
          {isSigningIn ? "Redirecting…" : "Continue with Google"}
        </button>
        {error && <p className="opp-error">{error}</p>}
      </div>
    </main>
  );
}
