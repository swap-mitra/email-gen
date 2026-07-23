import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { workspaceContextResponseSchema } from "@/lib/contracts/api";
import { requireWorkspaceContext } from "@/lib/workspaces";

export const GET = apiRoute("Unable to resolve workspace context.", async () => {
  const { context, response } = await requireWorkspaceContext();
  if (response) return response;

  const payload = workspaceContextResponseSchema.parse({
    workspace: context.workspace,
    membership: context.membership,
    viewer: {
      userId: context.userId,
      organizationId: context.orgId,
    },
  });

  return NextResponse.json(payload);
});
