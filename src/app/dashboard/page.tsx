import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { drafts, draftVersions, member, opportunities, organization } from "@/db/schema";
import { CreateWorkspaceForm } from "@/components/create-workspace-form";
import { getDb } from "@/lib/db";
import { opportunityTitle, urlHost } from "@/lib/labels";
import { getActiveWorkspaceContext } from "@/lib/workspaces";
import { NewOpportunityForm } from "./new-opportunity-form";

export const dynamic = "force-dynamic";

type Attention = {
  href: string;
  title: string;
  reason: string;
};

export default async function DashboardPage() {
  const context = await getActiveWorkspaceContext();

  /* ── No-org state ─────────────────────────────────────────────── */
  if (!context.orgId) {
    // A session predating the active-org seeding in src/lib/auth.ts can still
    // reach here with memberships already in hand — offer those rather than
    // pushing the member into creating a duplicate workspace.
    const joined = context.userId
      ? await getDb()
          .select({ id: organization.id, name: organization.name })
          .from(member)
          .innerJoin(organization, eq(organization.id, member.organizationId))
          .where(eq(member.userId, context.userId))
          .orderBy(asc(member.createdAt))
      : [];

    return (
      <div className="setup-prompt">
        <div className="setup-prompt-header">
          <h1>{joined.length > 0 ? "Choose a workspace" : "Create your first workspace"}</h1>
        </div>
        <div className="setup-prompt-body">
          <p>
            {joined.length > 0
              ? "Pick up where you left off, or start a new workspace — every opportunity, draft, and knowledge item is scoped to one workspace."
              : "Create a workspace to get started — every opportunity, draft, and knowledge item is scoped to one workspace."}
          </p>
          <CreateWorkspaceForm existing={joined} />
        </div>
      </div>
    );
  }

  const db = getDb();
  const [opportunityRows, draftRows] = await Promise.all([
    db
      .select()
      .from(opportunities)
      .where(eq(opportunities.workspaceId, context.workspace.id))
      .orderBy(desc(opportunities.createdAt))
      .limit(100),
    db.query.drafts.findMany({
      where: eq(drafts.workspaceId, context.workspace.id),
      with: {
        versions: { orderBy: [desc(draftVersions.versionNumber)], limit: 1 },
      },
      orderBy: [desc(drafts.updatedAt)],
      limit: 100,
    }),
  ]);

  const ingestingCount = opportunityRows.filter(
    (o) => o.ingestStatus === "pending" || o.ingestStatus === "running",
  ).length;
  const awaitingApprovalCount = draftRows.filter(
    (d) => d.generationStatus === "completed" && d.state !== "approved_for_send",
  ).length;
  const approvedCount = draftRows.filter((d) => d.state === "approved_for_send").length;

  const attention: Attention[] = [
    ...opportunityRows
      .filter((o) => o.ingestStatus === "failed")
      .slice(0, 5)
      .map((o) => ({
        href: `/dashboard/opportunities/${o.id}`,
        title: opportunityTitle(o.normalizedFields, urlHost(o.sourceUrl)),
        reason: o.ingestError ?? "Ingestion failed",
      })),
    ...draftRows
      .filter((d) => d.generationStatus === "failed")
      .slice(0, 5)
      .map((d) => ({
        href: `/dashboard/drafts/${d.id}`,
        title: d.versions[0]?.subject ?? `Draft ${d.id.slice(0, 8)}`,
        reason: d.generationError ?? "Draft generation failed",
      })),
  ].slice(0, 5);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="t-label page-kicker">Overview</p>
          <h1 className="page-title">{context.workspace.name}</h1>
        </div>
        <span className="opp-badge">{context.membership.role}</span>
      </div>

      <div className="dash-block-card">
        <h2 className="block-title">New opportunity</h2>
        <NewOpportunityForm />
      </div>

      <div className="stat-grid">
        <Link className="stat-tile" href="/dashboard/opportunities">
          <span className="stat-value">{opportunityRows.length}</span>
          <span className="stat-label">Opportunities</span>
        </Link>
        <Link className="stat-tile" href="/dashboard/opportunities">
          <span className="stat-value">{ingestingCount}</span>
          <span className="stat-label">Ingesting now</span>
        </Link>
        <Link className="stat-tile" href="/dashboard/approvals">
          <span className="stat-value">{awaitingApprovalCount}</span>
          <span className="stat-label">Awaiting approval</span>
        </Link>
        <Link className="stat-tile" href="/dashboard/drafts">
          <span className="stat-value">{approvedCount}</span>
          <span className="stat-label">Approved</span>
        </Link>
      </div>

      {attention.length > 0 && (
        <div className="dash-block-card">
          <h2 className="block-title">Needs attention</h2>
          <ul className="attention-list">
            {attention.map((item) => (
              <li key={item.href}>
                <Link className="attention-link" href={item.href}>
                  <span className="attention-item-main">
                    <span className="attention-item-title">{item.title}</span>
                    <span className="attention-item-reason">{item.reason}</span>
                  </span>
                  <span className="attention-item-arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
