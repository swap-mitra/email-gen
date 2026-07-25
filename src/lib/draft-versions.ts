import { sql } from "drizzle-orm";
import { draftVersions } from "@/db/schema";
import { getDb } from "@/lib/db";

type NewDraftVersion = {
  draftId: string;
  workspaceId: string;
  subject: string;
  body: string;
  source: "ai_generated" | "human_revised";
  groundingRefs?: string[];
  authorUserId?: string | null;
};

/** postgres.js surfaces the SQLSTATE as `code`; 23505 is unique_violation. */
function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23505";
}

/**
 * Inserts the next version of a draft, numbering it in the same statement that
 * writes it.
 *
 * Reading `max(version_number)` into JS and inserting `+ 1` races: two
 * concurrent revisions — or an Inngest step retried after the insert landed
 * but a later write in the same step failed — compute the same number. Every
 * reader is `order by version_number desc limit 1`, so the loser doesn't
 * error, it just silently disappears from the editor and from approvals.
 *
 * The subquery narrows the window to a single statement, and the unique
 * constraint on (draft_id, version_number) closes the rest: a collision fails
 * the insert rather than duplicating a number, and one retry re-reads the
 * now-committed maximum.
 */
export async function insertNextDraftVersion(version: NewDraftVersion) {
  const db = getDb();

  const insertOnce = async () => {
    const [row] = await db
      .insert(draftVersions)
      .values({
        ...version,
        groundingRefs: version.groundingRefs ?? [],
        versionNumber: sql`(
          select coalesce(max(${draftVersions.versionNumber}), 0) + 1
          from ${draftVersions}
          where ${draftVersions.draftId} = ${version.draftId}
        )`,
      })
      .returning();
    return row;
  };

  try {
    return await insertOnce();
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  return insertOnce();
}
