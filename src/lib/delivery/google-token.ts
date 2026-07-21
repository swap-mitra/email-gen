import { clerkClient } from "@clerk/nextjs/server";
import { DeliveryError } from "./errors";

export type GoogleAccessToken = {
  accessToken: string;
  /** Resolved Gmail address, for audit/display only. */
  email: string | null;
};

/**
 * Resolves a Clerk user's Google OAuth access token (minted with the
 * gmail.compose scope, once the Clerk Dashboard's Google connection is
 * configured for it) plus their Gmail address. Throws a typed DeliveryError
 * rather than leaking raw Clerk/network errors to the API response — the
 * caller needs to distinguish "no Google account linked" from "token/scope
 * problem" from "Clerk itself is unreachable" to show an actionable message.
 */
export async function getGoogleAccessToken(clerkUserId: string): Promise<GoogleAccessToken> {
  const client = await clerkClient();

  let tokens;
  try {
    tokens = await client.users.getUserOauthAccessToken(clerkUserId, "google");
  } catch {
    throw new DeliveryError(
      "not_configured",
      "Could not look up your Google connection. Try again in a moment.",
    );
  }

  const accessToken = tokens.data[0]?.token;
  if (!accessToken) {
    throw new DeliveryError(
      "no_account",
      "Connect a Google account with Gmail access to export drafts to Gmail.",
    );
  }

  // Email is for display only, and the scope check here is defense-in-depth
  // — Gmail's own 403 on the actual API call is the authoritative check —
  // so a failure resolving either just falls through with email left null.
  let email: string | null = null;
  try {
    const user = await client.users.getUser(clerkUserId);
    const googleAccount = user.externalAccounts.find((account) => account.provider === "google");
    email = googleAccount?.emailAddress ?? null;

    if (googleAccount && !googleAccount.approvedScopes?.includes("gmail.compose")) {
      throw new DeliveryError(
        "insufficient_scope",
        "Your Google connection doesn't have Gmail access yet. Reconnect Google to grant it.",
      );
    }
  } catch (err) {
    if (err instanceof DeliveryError) throw err;
  }

  return { accessToken, email };
}
