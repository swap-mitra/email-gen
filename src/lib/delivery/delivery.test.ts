import { clerkClient } from "@clerk/nextjs/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMimeMessage, createGmailDraft } from "@/lib/delivery/gmail-client";
import { getGoogleAccessToken } from "@/lib/delivery/google-token";
import { DeliveryError } from "@/lib/delivery/errors";
import { manualExportProvider } from "@/lib/delivery/providers/manual-export";

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(),
}));

// ---------------------------------------------------------------------------
// gmail-client.ts — buildMimeMessage (pure)
// ---------------------------------------------------------------------------

describe("P10 Delivery — buildMimeMessage", () => {
  it("includes a To header when a recipient is known", () => {
    const message = buildMimeMessage({
      to: "hiring@acme.com",
      subject: "Quick question",
      body: "Hi there",
    });

    expect(message).toContain("To: hiring@acme.com");
    expect(message).toContain("Subject: Quick question");
    expect(message).toContain("\r\n\r\nHi there");
  });

  it("omits the To header when no recipient is known", () => {
    const message = buildMimeMessage({ to: null, subject: "Subject", body: "Body" });
    expect(message).not.toContain("To:");
  });

  it("RFC 2047-encodes non-ASCII subjects", () => {
    const message = buildMimeMessage({ to: null, subject: "Café opening", body: "Body" });
    expect(message).toMatch(/Subject: =\?UTF-8\?B\?/);
  });
});

// ---------------------------------------------------------------------------
// gmail-client.ts — createGmailDraft (fetch-mocked)
// ---------------------------------------------------------------------------

describe("P10 Delivery — createGmailDraft", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("base64url-encodes the raw message (no +, /, or = padding)", async () => {
    let capturedBody: string | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        capturedBody = init.body as string;
        return new Response(JSON.stringify({ id: "draft-123" }), { status: 200 });
      }),
    );

    await createGmailDraft({
      accessToken: "token",
      to: "hiring@acme.com",
      subject: "Test",
      body: "x".repeat(200), // long enough to reliably contain +//= in standard base64
    });

    const { raw } = JSON.parse(capturedBody!).message;
    expect(raw).not.toMatch(/[+/=]/);
  });

  it("returns the created draft id on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ id: "draft-abc" }), { status: 200 })),
    );

    const result = await createGmailDraft({ accessToken: "token", to: null, subject: "s", body: "b" });
    expect(result).toEqual({ id: "draft-abc" });
  });

  it("maps a 401 response to invalid_token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));

    await expect(
      createGmailDraft({ accessToken: "bad", to: null, subject: "s", body: "b" }),
    ).rejects.toMatchObject({ reason: "invalid_token" } satisfies Partial<DeliveryError>);
  });

  it("maps a 403 response to insufficient_scope", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 403 })));

    await expect(
      createGmailDraft({ accessToken: "token", to: null, subject: "s", body: "b" }),
    ).rejects.toMatchObject({ reason: "insufficient_scope" } satisfies Partial<DeliveryError>);
  });

  it("maps other non-OK responses to upstream_error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("server exploded", { status: 500 })));

    await expect(
      createGmailDraft({ accessToken: "token", to: null, subject: "s", body: "b" }),
    ).rejects.toMatchObject({ reason: "upstream_error" } satisfies Partial<DeliveryError>);
  });

  it("maps a thrown network error to upstream_error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    await expect(
      createGmailDraft({ accessToken: "token", to: null, subject: "s", body: "b" }),
    ).rejects.toMatchObject({ reason: "upstream_error" } satisfies Partial<DeliveryError>);
  });
});

// ---------------------------------------------------------------------------
// providers/manual-export.ts
// ---------------------------------------------------------------------------

describe("P10 Delivery — manualExportProvider", () => {
  it("always resolves with no external reference", async () => {
    const result = await manualExportProvider.createDraft({
      clerkUserId: "user_123",
      subject: "s",
      body: "b",
      toEmail: null,
    });
    expect(result).toEqual({ providerRef: null, externalAccountEmail: null });
  });
});

// ---------------------------------------------------------------------------
// google-token.ts — getGoogleAccessToken (Clerk backend SDK mocked)
// ---------------------------------------------------------------------------

describe("P10 Delivery — getGoogleAccessToken", () => {
  it("throws no_account when the user has no Google OAuth token", async () => {
    vi.mocked(clerkClient).mockResolvedValue({
      users: {
        getUserOauthAccessToken: vi.fn().mockResolvedValue({ data: [] }),
        getUser: vi.fn(),
      },
    } as never);

    await expect(getGoogleAccessToken("user_1")).rejects.toMatchObject({
      reason: "no_account",
    } satisfies Partial<DeliveryError>);
  });

  it("throws not_configured when Clerk itself fails to respond", async () => {
    vi.mocked(clerkClient).mockResolvedValue({
      users: {
        getUserOauthAccessToken: vi.fn().mockRejectedValue(new Error("clerk unreachable")),
        getUser: vi.fn(),
      },
    } as never);

    await expect(getGoogleAccessToken("user_1")).rejects.toMatchObject({
      reason: "not_configured",
    } satisfies Partial<DeliveryError>);
  });

  it("resolves the access token and Gmail address on success", async () => {
    vi.mocked(clerkClient).mockResolvedValue({
      users: {
        getUserOauthAccessToken: vi.fn().mockResolvedValue({ data: [{ token: "tok_123" }] }),
        getUser: vi.fn().mockResolvedValue({
          externalAccounts: [
            {
              provider: "google",
              emailAddress: "alice@gmail.com",
              approvedScopes: "email profile gmail.compose",
            },
          ],
        }),
      },
    } as never);

    const result = await getGoogleAccessToken("user_1");
    expect(result).toEqual({ accessToken: "tok_123", email: "alice@gmail.com" });
  });
});
