import { eq } from "drizzle-orm";
import { user } from "@/db/schema";
import { getDb } from "@/lib/db";

/**
 * Resolves a user ID to a human-readable name for display. Falls back to
 * email, then the raw ID, if a name isn't set.
 */
export async function resolveUserName(userId: string): Promise<string> {
  const db = getDb();
  const row = await db.query.user.findFirst({ where: eq(user.id, userId) });
  return row?.name ?? row?.email ?? userId;
}
