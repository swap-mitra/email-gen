import { headers } from "next/headers";
import type { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import {
  workspaces,
  organization,
  member,
  type Workspace,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { createApiErrorResponse } from "@/lib/api";
import { recordActivity } from "@/lib/activity";
import { getDb } from "@/lib/db";

type Membership = typeof member.$inferSelect;

/** The active-workspace context once a signed-in user's workspace is resolved. */
export type WorkspaceContext = {
  userId: string;
  orgId: string;
  workspace: Workspace;
  membership: Membership;
};

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
      membership: Membership;
    };

export async function getActiveWorkspaceContext(): Promise<ActiveWorkspaceContext> {
  const sessionData = await auth.api.getSession({ headers: await headers() });

  if (!sessionData) {
    return {
      userId: null,
      orgId: null,
      workspace: null,
      membership: null,
    };
  }

  const userId = sessionData.user.id;
  const orgId = (sessionData.session as { activeOrganizationId?: string | null })
    .activeOrganizationId ?? null;

  if (!orgId) {
    return {
      userId,
      orgId: null,
      workspace: null,
      membership: null,
    };
  }

  const db = getDb();
  const now = new Date();

  const org = await db.query.organization.findFirst({
    where: eq(organization.id, orgId),
  });

  if (!org) {
    throw new Error("Unable to resolve the active organization record.");
  }

  // Defensive lazy upsert of the local uuid-keyed mirror row — cheap and
  // idempotent, keeps every domain table's workspaceId FK pointed at a
  // stable uuid instead of Better-Auth's text organization id directly.
  await db
    .insert(workspaces)
    .values({
      organizationId: org.id,
      name: org.name,
      slug: org.slug,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: workspaces.organizationId,
      set: {
        name: org.name,
        slug: org.slug,
        updatedAt: now,
      },
    });

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.organizationId, orgId),
  });

  if (!workspace) {
    throw new Error("Unable to resolve the active workspace record.");
  }

  // Membership/role is sourced live from Better-Auth's own `member` table —
  // no local mirror, since Better-Auth's organization plugin is now the
  // sole owner of membership/role/invitation mutations.
  const membership = await db.query.member.findFirst({
    where: and(eq(member.organizationId, orgId), eq(member.userId, userId)),
  });

  if (!membership) {
    throw new Error("Unable to resolve the active workspace membership.");
  }

  const createdAtAge = Math.abs(now.getTime() - workspace.createdAt.getTime());
  if (createdAtAge < 5_000) {
    await recordActivity({
      workspaceId: workspace.id,
      actorUserId: userId,
      kind: "workspace.provisioned",
      entityType: "workspace",
      entityId: workspace.id,
      payload: {
        organizationId: orgId,
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

/**
 * Resolves the active workspace context for an API route, or the
 * ready-to-return error response (401 unauthenticated / 403 no active
 * workspace) if it isn't available.
 */
export async function requireWorkspaceContext(): Promise<
  { context: WorkspaceContext; response: null } | { context: null; response: NextResponse }
> {
  const context = await getActiveWorkspaceContext();

  if (!context.userId) {
    return {
      context: null,
      response: createApiErrorResponse({
        code: "unauthorized",
        message: "Authentication is required.",
        status: 401,
      }),
    };
  }

  if (!context.workspace) {
    return {
      context: null,
      response: createApiErrorResponse({
        code: "forbidden",
        message: "An active workspace is required.",
        status: 403,
      }),
    };
  }

  return { context, response: null };
}
