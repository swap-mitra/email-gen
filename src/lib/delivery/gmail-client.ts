import { DeliveryError } from "./errors";

const GMAIL_DRAFTS_URL = "https://gmail.googleapis.com/gmail/v1/users/me/drafts";
const REQUEST_TIMEOUT_MS = 15_000;

function encodeHeaderValue(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf-8").toString("base64url");
}

/** Builds a minimal RFC 2822 message. `to` is omitted when unknown — Gmail
 * allows creating a draft with no recipient. */
export function buildMimeMessage(args: { to: string | null; subject: string; body: string }): string {
  const headers = [
    args.to ? `To: ${args.to}` : null,
    `Subject: ${encodeHeaderValue(args.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
  ].filter((line): line is string => line !== null);

  return `${headers.join("\r\n")}\r\n\r\n${args.body}`;
}

/** Creates a draft in the authenticated user's Gmail account via the Gmail
 * REST API. Plain fetch, no SDK — matches this project's other external API
 * clients (see src/lib/ai/openrouter-client.ts). */
export async function createGmailDraft(args: {
  accessToken: string;
  to: string | null;
  subject: string;
  body: string;
}): Promise<{ id: string }> {
  const raw = base64UrlEncode(buildMimeMessage(args));

  let res: Response;
  try {
    res = await fetch(GMAIL_DRAFTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.accessToken}`,
      },
      body: JSON.stringify({ message: { raw } }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new DeliveryError("upstream_error", "Could not reach Gmail. Try again in a moment.");
  }

  if (res.status === 401) {
    throw new DeliveryError(
      "invalid_token",
      "Your Google sign-in has expired. Sign out and back in, then try again.",
    );
  }
  if (res.status === 403) {
    throw new DeliveryError(
      "insufficient_scope",
      "Your Google connection doesn't have Gmail access yet. Reconnect Google to grant it.",
    );
  }
  if (!res.ok) {
    const body = await res.text();
    throw new DeliveryError(
      "upstream_error",
      `Gmail API request failed (${res.status}): ${body}`,
    );
  }

  const json = (await res.json()) as { id?: string };
  if (!json.id) {
    throw new DeliveryError("upstream_error", "Gmail did not return a draft ID.");
  }
  return { id: json.id };
}
