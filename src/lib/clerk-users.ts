import { clerkClient } from "@clerk/nextjs/server";

/**
 * Resolves a Clerk user ID to a human-readable name for display. Falls back
 * to the raw ID if the lookup fails (e.g. the user was since deleted).
 */
export async function resolveClerkUserName(userId: string): Promise<string> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    return user.fullName ?? user.username ?? user.primaryEmailAddress?.emailAddress ?? userId;
  } catch {
    return userId;
  }
}
