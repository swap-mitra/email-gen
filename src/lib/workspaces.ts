import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import {
  workspaces,
  workspaceMemberships,
  type Workspace,
  type WorkspaceMembership,
} from "@/db/schema";
import { recordActivity } from "@/lib/activity";
import { getDb } from "@/lib/db";

type ActiveWorkspaceContext =
  | {
      userId: null;
      orgId: null;
      workspace: null;
      membership: null;
    }
  | {
      userId: string;
      orgId: null;
      workspace: null;
      membership: null;
    }
  | {
      userId: string;
      orgId: string;
      workspace: Workspace;
      membership: WorkspaceMembership;
    };

export async function getActiveWorkspaceContext(): Promise<ActiveWorkspaceContext> {
  const { userId, orgId, orgRole, orgSlug } = await auth();

  if (!userId) {
    return {
      userId: null,
      orgId: null,
      workspace: null,
      membership: null,
    };
  }

  if (!orgId) {
    return {
      userId,
      orgId: null,
      workspace: null,
      membership: null,
    };
  }

  const db = getDb();
  const workspaceName = humanizeSlug(orgSlug ?? orgId);
  const now = new Date();

  await db
    .insert(workspaces)
    .values({
      clerkOrganizationId: orgId,
      name: workspaceName,
      slug: orgSlug ?? orgId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: workspaces.clerkOrganizationId,
      set: {
        slug: orgSlug ?? orgId,
        name: workspaceName,
        updatedAt: now,
      },
    });

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.clerkOrganizationId, orgId),
  });

  if (!workspace) {
    throw new Error("Unable to resolve the active workspace record.");
  }

  await db
    .insert(workspaceMemberships)
    .values({
      workspaceId: workspace.id,
      clerkUserId: userId,
      role: orgRole ?? "org:member",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [workspaceMemberships.workspaceId, workspaceMemberships.clerkUserId],
      set: {
        role: orgRole ?? "org:member",
        updatedAt: now,
      },
    });

  const membership = await db.query.workspaceMemberships.findFirst({
    where: and(
      eq(workspaceMemberships.workspaceId, workspace.id),
      eq(workspaceMemberships.clerkUserId, userId),
    ),
  });

  if (!membership) {
    throw new Error("Unable to resolve the active workspace membership.");
  }

  const createdAtAge = Math.abs(now.getTime() - workspace.createdAt.getTime());
  if (createdAtAge < 5_000) {
    await recordActivity({
      workspaceId: workspace.id,
      actorClerkUserId: userId,
      kind: "workspace.provisioned",
      entityType: "workspace",
      entityId: workspace.id,
      payload: {
        clerkOrganizationId: orgId,
      },
    });
  }

  return {
    userId,
    orgId,
    workspace,
    membership,
  };
}

function humanizeSlug(value: string) {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
