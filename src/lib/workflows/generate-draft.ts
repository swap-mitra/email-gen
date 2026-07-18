import { NonRetriableError } from "inngest";
import { eq, max } from "drizzle-orm";
import { inngest, DRAFT_GENERATE_EVENT, type DraftGenerateData } from "@/lib/inngest";
import { drafts, draftVersions, opportunities } from "@/db/schema";
import { recordActivity } from "@/lib/activity";
import { getDb } from "@/lib/db";
import { retrieveKnowledgeForOpportunity } from "@/lib/ai/retrieval";
import { generateDraftEmail } from "@/lib/ai/generation";
import { isAnthropicConfigured } from "@/lib/ai/anthropic-client";

function buildRetrievalQuery(normalizedFields: Record<string, unknown> | null): string {
  if (!normalizedFields) return "";
  const parts = [
    normalizedFields.title,
    normalizedFields.company,
    normalizedFields.description,
    normalizedFields.summary,
  ].filter((v): v is string => typeof v === "string" && v.length > 0);
  return parts.join(" ");
}

export const generateDraft = inngest.createFunction(
  {
    id: "generate-draft",
    name: "Generate Draft",
    retries: 3,
    triggers: [{ event: DRAFT_GENERATE_EVENT }],
    concurrency: {
      limit: 1,
      key: "event.data.draftId",
    },
  },
  async ({ event, step }) => {
    const { draftId, workspaceId, opportunityId } = event.data as DraftGenerateData;

    // ── Step 1: Mark as running ──────────────────────────────────────────
    const opportunity = await step.run("mark-running", async () => {
      const db = getDb();

      const draft = await db.query.drafts.findFirst({
        where: eq(drafts.id, draftId),
      });

      if (!draft) {
        throw new NonRetriableError(`Draft ${draftId} not found.`);
      }

      const opp = await db.query.opportunities.findFirst({
        where: eq(opportunities.id, opportunityId),
      });

      if (!opp) {
        throw new NonRetriableError(`Opportunity ${opportunityId} not found.`);
      }

      await db
        .update(drafts)
        .set({ generationStatus: "running", updatedAt: new Date() })
        .where(eq(drafts.id, draftId));

      await recordActivity({
        workspaceId,
        kind: "draft.generation_started",
        entityType: "draft",
        entityId: draftId,
        payload: { opportunityId },
      });

      return {
        sourceUrl: opp.sourceUrl,
        normalizedFields: opp.normalizedFields,
      };
    });

    // ── Step 2: Retrieve knowledge ────────────────────────────────────────
    //    Hybrid retrieval: metadata filter by workspaceId, lexical search
    //    over knowledge_items.content, vector cosine similarity via
    //    pgvector, fused with reciprocal rank fusion, and reranked with
    //    maximal marginal relevance to reduce duplicate evidence.
    const retrievedItems = await step.run("retrieve-knowledge", async () => {
      const queryText = buildRetrievalQuery(
        opportunity.normalizedFields as Record<string, unknown> | null,
      );

      const items = await retrieveKnowledgeForOpportunity({
        workspaceId,
        queryText,
      });

      return items.map((item) => ({ id: item.id, title: item.title, content: item.content }));
    });

    // ── Step 3: Generate content ──────────────────────────────────────────
    //    Grounded generation via Claude Opus 4.8 using normalized opportunity data
    //    plus the retrieved knowledge items.
    const generated = await step.run("generate-content", async () => {
      if (!isAnthropicConfigured()) {
        // Draft generation has no non-AI fallback — fail fast rather than
        // burning retries on a permanent configuration problem.
        throw new NonRetriableError(
          "ANTHROPIC_API_KEY must be set to generate drafts.",
        );
      }

      const draftEmail = await generateDraftEmail({
        opportunity: {
          sourceUrl: opportunity.sourceUrl,
          normalizedFields: opportunity.normalizedFields,
        },
        knowledgeItems: retrievedItems,
      });

      return {
        subject: draftEmail.subject,
        body: draftEmail.body,
        groundingRefs: retrievedItems.map((item) => item.id),
      };
    });

    // ── Step 4: Persist draft version ─────────────────────────────────────
    await step.run("persist-version", async () => {
      const db = getDb();

      const [{ maxVersion }] = await db
        .select({ maxVersion: max(draftVersions.versionNumber) })
        .from(draftVersions)
        .where(eq(draftVersions.draftId, draftId));

      const nextVersion = (maxVersion ?? 0) + 1;

      await db.insert(draftVersions).values({
        draftId,
        workspaceId,
        versionNumber: nextVersion,
        subject: generated.subject,
        body: generated.body,
        groundingRefs: generated.groundingRefs,
        source: "ai_generated",
      });

      await db
        .update(drafts)
        .set({ state: "draft_generated", generationStatus: "completed", updatedAt: new Date() })
        .where(eq(drafts.id, draftId));
    });

    // ── Step 5: Log completion ───────────────────────────────────────────
    await step.run("log-completion", async () => {
      await recordActivity({
        workspaceId,
        kind: "draft.generation_completed",
        entityType: "draft",
        entityId: draftId,
        payload: {
          opportunityId,
          groundingRefsCount: generated.groundingRefs.length,
        },
      });
    });

    return { draftId, groundingRefsCount: generated.groundingRefs.length };
  },
);

/**
 * Failure hook — marks the draft as failed and records an activity.
 */
export const onGenerateDraftFailure = inngest.createFunction(
  {
    id: "on-generate-draft-failure",
    name: "Handle Draft Generation Failure",
    triggers: [{ event: "inngest/function.failed" }],
  },
  async ({ event, step }) => {
    const original = (event.data as Record<string, unknown>).event as {
      name: string;
      data: DraftGenerateData;
    };
    if (original.name !== "email-gen/draft.generate") return;

    const { draftId, workspaceId } = original.data;
    const errorMessage =
      ((event.data as Record<string, unknown>).error as { message?: string })?.message ??
      "Unknown error";

    await step.run("mark-failed", async () => {
      const db = getDb();
      await db
        .update(drafts)
        .set({
          generationStatus: "failed",
          generationError: errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(drafts.id, draftId));

      await recordActivity({
        workspaceId,
        kind: "draft.generation_failed",
        entityType: "draft",
        entityId: draftId,
        payload: { error: errorMessage },
      });
    });
  },
);
