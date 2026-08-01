import { NextResponse } from "next/server";
import { count, eq, gt } from "drizzle-orm";
import { apiRoute, createApiErrorResponse, parseBody } from "@/lib/api";
import { createAccessRequestSchema } from "@/lib/contracts/api";
import { accessRequests, user } from "@/db/schema";
import { getDb } from "@/lib/db";
import { sendGmailMessage, safeRecipient } from "@/lib/delivery/gmail-client";
import { getGoogleAccessToken } from "@/lib/delivery/google-token";
import { logger } from "@/lib/logger";

// This route is deliberately unauthenticated — it's the only way someone
// without an account can reach the admin. That makes it the app's one
// spam-reachable write, so the throttle below is a global ceiling rather than
// the per-workspace limit every other mutating route uses.
const GLOBAL_RATE_LIMIT_MAX = 30;
const GLOBAL_RATE_LIMIT_WINDOW_MINUTES = 60;

export const POST = apiRoute("Failed to submit your access request.", async (req: Request) => {
  // Admin mailbox notified of new requests; also the account whose Google
  // token sends the notification, so it must belong to a signed-in user. Read
  // per-request rather than at module load, which would freeze whatever was
  // set when the route was first imported.
  const notifyEmail = process.env.ACCESS_REQUEST_NOTIFY_EMAIL;

  const { data, error } = await parseBody(req, createAccessRequestSchema);
  if (error) return error;

  const email = data.email.toLowerCase();
  const db = getDb();

  const since = new Date(Date.now() - GLOBAL_RATE_LIMIT_WINDOW_MINUTES * 60_000);
  const [recent] = await db
    .select({ value: count() })
    .from(accessRequests)
    .where(gt(accessRequests.createdAt, since));

  if ((recent?.value ?? 0) >= GLOBAL_RATE_LIMIT_MAX) {
    return createApiErrorResponse({
      code: "rate_limited",
      message: "Too many access requests right now. Try again later.",
      status: 429,
    });
  }

  const [inserted] = await db
    .insert(accessRequests)
    .values({ email })
    .onConflictDoNothing({ target: accessRequests.email })
    .returning();

  // Already on the list — same response as a fresh request, so the endpoint
  // can't be used to probe who has already asked, and the admin isn't
  // re-notified for a repeat submission.
  if (!inserted) {
    return NextResponse.json({ status: "received" }, { status: 202 });
  }

  // The request is recorded either way; a notification failure must not lose
  // it or surface as an error to someone who did nothing wrong.
  try {
    if (!notifyEmail) throw new Error("ACCESS_REQUEST_NOTIFY_EMAIL is not set");

    const admin = await db.query.user.findFirst({ where: eq(user.email, notifyEmail) });
    if (!admin) throw new Error(`No signed-in user matches ${notifyEmail}`);

    const { accessToken } = await getGoogleAccessToken(admin.id);
    await sendGmailMessage({
      accessToken,
      to: notifyEmail,
      subject: `Groundwork access request: ${email}`,
      // safeRecipient re-validates rather than trusting the Zod check, since
      // this string lands in a header the admin's mail client will parse.
      body: `${safeRecipient(email) ?? email} requested access to Groundwork.\n\nRequested at ${inserted.createdAt.toISOString()}.`,
    });
  } catch (err) {
    logger.error("access_request_notify_failed", { email, error: err });
  }

  return NextResponse.json({ status: "received" }, { status: 202 });
});
