import { and, desc, eq } from "drizzle-orm";
import { activities } from "@/db/schema";
import { getDb } from "@/lib/db";

type RecordActivityInput = {
  workspaceId: string;
  actorClerkUserId?: string | null;
  kind: string;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
};

export async function recordActivity(input: RecordActivityInput) {
  const db = getDb();

  await db.insert(activities).values({
    workspaceId: input.workspaceId,
    actorClerkUserId: input.actorClerkUserId ?? null,
    kind: input.kind,
    entityType: input.entityType,
    entityId: input.entityId,
    payload: input.payload ?? {},
  });
}

export async function listRecentActivities(workspaceId: string, limit = 10) {
  const db = getDb();

  return db
    .select()
    .from(activities)
    .where(eq(activities.workspaceId, workspaceId))
    .orderBy(desc(activities.createdAt))
    .limit(limit);
}

export async function listActivitiesForEntity(
  workspaceId: string,
  entityId: string,
  limit = 50,
) {
  const db = getDb();

  return db
    .select()
    .from(activities)
    .where(and(eq(activities.workspaceId, workspaceId), eq(activities.entityId, entityId)))
    .orderBy(desc(activities.createdAt))
    .limit(limit);
}
