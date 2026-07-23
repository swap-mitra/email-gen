import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { activitiesResponseSchema } from "@/lib/contracts/api";
import { listRecentActivities } from "@/lib/activity";
import { requireWorkspaceContext } from "@/lib/workspaces";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export const GET = apiRoute("Failed to fetch activities.", async (req: Request) => {
  const { context, response } = await requireWorkspaceContext();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const rawLimit = Number(searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(1, rawLimit), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const items = await listRecentActivities(context.workspace.id, limit);

  return NextResponse.json(activitiesResponseSchema.parse({ items }));
});
