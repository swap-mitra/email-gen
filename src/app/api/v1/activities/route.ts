import { NextResponse } from "next/server";
import { apiRoute, parseLimit } from "@/lib/api";
import { activitiesResponseSchema } from "@/lib/contracts/api";
import { listRecentActivities } from "@/lib/activity";
import { requireWorkspaceContext } from "@/lib/workspaces";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export const GET = apiRoute("Failed to fetch activities.", async (req: Request) => {
  const { context, response } = await requireWorkspaceContext();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams, { fallback: DEFAULT_LIMIT, max: MAX_LIMIT });

  const items = await listRecentActivities(context.workspace.id, limit);

  return NextResponse.json(activitiesResponseSchema.parse({ items }));
});
