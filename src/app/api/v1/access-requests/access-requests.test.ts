import { describe, expect, it, vi, beforeEach } from "vitest";
import { createAccessRequestSchema } from "@/lib/contracts/api";
import { sendGmailMessage } from "@/lib/delivery/gmail-client";
import { getGoogleAccessToken } from "@/lib/delivery/google-token";
import { getDb } from "@/lib/db";
import { POST } from "./route";

vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/delivery/google-token", () => ({ getGoogleAccessToken: vi.fn() }));
vi.mock("@/lib/delivery/gmail-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/delivery/gmail-client")>()),
  sendGmailMessage: vi.fn(),
}));

/** Minimal stand-in for the two queries the route runs: a count of recent rows
 * and an insert that either returns the new row or nothing (conflict). */
function mockDb({ recentCount, inserted }: { recentCount: number; inserted: unknown }) {
  vi.mocked(getDb).mockReturnValue({
    select: () => ({ from: () => ({ where: async () => [{ value: recentCount }] }) }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({ returning: async () => (inserted ? [inserted] : []) }),
      }),
    }),
    query: { user: { findFirst: vi.fn().mockResolvedValue({ id: "admin-1" }) } },
  } as never);
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/v1/access-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ACCESS_REQUEST_NOTIFY_EMAIL", "admin@example.com");
  vi.mocked(getGoogleAccessToken).mockResolvedValue({ accessToken: "tok", email: null });
});

describe("createAccessRequestSchema", () => {
  it("rejects a non-email and trims a valid one", () => {
    expect(createAccessRequestSchema.safeParse({ email: "nope" }).success).toBe(false);
    expect(createAccessRequestSchema.parse({ email: "  a@b.co  " }).email).toBe("a@b.co");
  });
});

describe("POST /api/v1/access-requests", () => {
  it("records a new request and notifies the admin once", async () => {
    mockDb({ recentCount: 0, inserted: { createdAt: new Date("2026-08-01T00:00:00Z") } });

    const res = await post({ email: "New@Example.com" });

    expect(res.status).toBe(202);
    expect(sendGmailMessage).toHaveBeenCalledOnce();
    const arg = vi.mocked(sendGmailMessage).mock.calls[0][0];
    expect(arg.to).toBe("admin@example.com");
    // Normalized before storage, so casing can't create a duplicate row.
    expect(arg.subject).toContain("new@example.com");
  });

  it("stays silent on a duplicate instead of re-notifying", async () => {
    mockDb({ recentCount: 0, inserted: null });

    const res = await post({ email: "dupe@example.com" });

    expect(res.status).toBe(202);
    expect(sendGmailMessage).not.toHaveBeenCalled();
  });

  it("still records the request when the notification fails", async () => {
    mockDb({ recentCount: 0, inserted: { createdAt: new Date() } });
    vi.mocked(sendGmailMessage).mockRejectedValue(new Error("gmail down"));

    expect((await post({ email: "ok@example.com" })).status).toBe(202);
  });

  it("throttles once the global window is full", async () => {
    mockDb({ recentCount: 30, inserted: { createdAt: new Date() } });

    const res = await post({ email: "late@example.com" });

    expect(res.status).toBe(429);
    expect(sendGmailMessage).not.toHaveBeenCalled();
  });

  it("rejects an invalid email before touching the database", async () => {
    mockDb({ recentCount: 0, inserted: null });

    expect((await post({ email: "not-an-email" })).status).toBe(400);
    expect(sendGmailMessage).not.toHaveBeenCalled();
  });
});
