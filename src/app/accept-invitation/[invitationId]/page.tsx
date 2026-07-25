"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const { invitationId } = use(params);
  const router = useRouter();
  const [status, setStatus] = useState<"pending" | "error">("pending");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function accept() {
      const { error } = await authClient.organization.acceptInvitation({ invitationId });
      if (cancelled) return;
      if (error) {
        setStatus("error");
        setMessage(error.message ?? "This invitation could not be accepted.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    }

    accept();
    return () => {
      cancelled = true;
    };
  }, [invitationId, router]);

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <h1 className="page-title">
          {status === "error" ? "Couldn't join workspace" : "Joining workspace…"}
        </h1>
        {status === "error" && (
          <>
            <p className="opp-error">{message}</p>
            <p className="page-intro">
              If you weren&apos;t signed in with the invited email address, sign in with that
              account and open this link again.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
