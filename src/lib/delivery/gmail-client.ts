import { DeliveryError } from "./errors";

const GMAIL_DRAFTS_URL = "https://gmail.googleapis.com/gmail/v1/users/me/drafts";
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * A bare CR or LF in a header value terminates the header, and everything
 * after it is parsed as further headers — so an injected "\r\nBcc: ..." would
 * silently add recipients to a draft the user then sends themselves. Neither
 * of the two values interpolated below is trustworthy: the subject is model-
 * generated (or user-edited) and the recipient comes from AI extraction over
 * a scraped third-party page.
 */
function stripHeaderBreaks(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/**
 * RFC 5322 addr-spec, conservatively: no whitespace and none of the
 * characters that carry meaning in an address list. An address can't be
 * RFC 2047 encoded the way a subject can — encoding would stop it being an
 * address — so anything that doesn't match is dropped instead.
 */
const ADDR_SPEC = /^[^\s@<>,;:"\\]+@[^\s@<>,;:"\\]+\.[^\s@<>,;:"\\]+$/;

export function safeRecipient(to: string | null | undefined): string | null {
  if (!to) return null;
  const trimmed = to.trim();
  return ADDR_SPEC.test(trimmed) ? trimmed : null;
}

function encodeHeaderValue(value: string): string {
  const safe = stripHeaderBreaks(value);
  // Printable ASCII only — control characters go through the encoded-word
  // path rather than being emitted raw.
  if (/^[\x20-\x7E]*$/.test(safe)) return safe;
  return `=?UTF-8?B?${Buffer.from(safe, "utf-8").toString("base64")}?=`;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf-8").toString("base64url");
}

/** Builds a minimal RFC 2822 message. `to` is omitted when unknown or when it
 * isn't a plain address — Gmail allows creating a draft with no recipient. */
export function buildMimeMessage(args: { to: string | null; subject: string; body: string }): string {
  const recipient = safeRecipient(args.to);
  const headers = [
    recipient ? `To: ${recipient}` : null,
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
