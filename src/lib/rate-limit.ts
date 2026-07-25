import { and, count, eq, gt, type SQL } from "drizzle-orm";
import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db";

/** Thrown when a workspace has exceeded an action's rate limit. */
export class RateLimitError extends Error {}

/**
 * Durable, Postgres-backed rate limit — counts rows a workspace has created
 * in the trailing window. Deliberately not an in-memory counter: this app
 * can run as multiple/ephemeral serverless instances, so process-local state
 * wouldn't hold across requests.
 *
 * ponytail: counts and then returns, so requests racing at the ceiling can
 * all pass and overshoot the limit by roughly the concurrency. Closing that
 * needs either a dedicated counter table with an atomic upsert or folding the
 * check into each caller's INSERT ... WHERE, both of which cost more than a
 * bounded overshoot on a soft 10-minute limit is worth. Upgrade if a limit
 * ever guards spend rather than sloppiness.
 */
export async function assertUnderRateLimit({
  table,
  workspaceIdColumn,
  createdAtColumn,
  workspaceId,
  windowMinutes,
  max,
  action,
  extraCondition,
}: {
  table: AnyPgTable;
  workspaceIdColumn: AnyPgColumn;
  createdAtColumn: AnyPgColumn;
  workspaceId: string;
  windowMinutes: number;
  max: number;
  action: string;
  /** Optional additional filter, e.g. narrowing to one activity `kind`. */
  extraCondition?: SQL;
}): Promise<void> {
  const db = getDb();
  const since = new Date(Date.now() - windowMinutes * 60_000);

  const [row] = await db
    .select({ value: count() })
    .from(table)
    .where(and(eq(workspaceIdColumn, workspaceId), gt(createdAtColumn, since), extraCondition));

  if ((row?.value ?? 0) >= max) {
    throw new RateLimitError(
      `Too many ${action} in the last ${windowMinutes} minute(s) for this workspace (limit ${max}). Try again shortly.`,
    );
  }
}
