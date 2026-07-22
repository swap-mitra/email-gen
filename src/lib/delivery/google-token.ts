import { and, eq } from "drizzle-orm";
import { account, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { DeliveryError } from "./errors";

export type GoogleAccessToken = {
  accessToken: string;
  /** Resolved Gmail address, for audit/display only. */
  email: string | null;
};

/**
 * Resolves a signed-in user's Google OAuth access token (minted with the
 * gmail.compose scope at sign-in, since Google is this app's only sign-in
 * method) plus their Gmail address. Throws a typed DeliveryError rather than
 * leaking raw Better-Auth/network errors to the API response — the caller
 * needs to distinguish "no Google account linked" from "token/scope problem"
 * from "the refresh call itself failed" to show an actionable message.
 */
export async function getGoogleAccessToken(userId: string): Promise<GoogleAccessToken> {
  const db = getDb();

  const linkedAccount = await db.query.account.findFirst({
    where: and(eq(account.userId, userId), eq(account.providerId, "google")),
  });

  if (!linkedAccount) {
    throw new DeliveryError(
      "no_account",
      "Connect a Google account with Gmail access to export drafts to Gmail.",
    );
  }

  // Defense-in-depth only — Gmail's own 403 on the actual API call is the
  // authoritative check.
  if (linkedAccount.scope && !linkedAccount.scope.includes("gmail.compose")) {
    throw new DeliveryError(
      "insufficient_scope",
      "Your Google connection doesn't have Gmail access yet. Reconnect Google to grant it.",
    );
  }

  let accessToken: string;
  try {
    const result = await auth.api.getAccessToken({
      body: { providerId: "google", userId },
    });
    accessToken = result.accessToken;
  } catch {
    throw new DeliveryError(
      "not_configured",
      "Could not refresh your Google access token. Try again in a moment.",
    );
  }

  const userRow = await db.query.user.findFirst({ where: eq(user.id, userId) });

  return { accessToken, email: userRow?.email ?? null };
}
