import { NonRetriableError } from "inngest";
import { and, eq } from "drizzle-orm";
import {
  createFailureHandler,
  inngest,
  DRAFT_GENERATE_EVENT,
  type DraftGenerateData,
} from "@/lib/inngest";
import { drafts, opportunities } from "@/db/schema";
import { recordActivity } from "@/lib/activity";
import { getDb } from "@/lib/db";
import { insertNextDraftVersion } from "@/lib/draft-versions";
import { retrieveKnowledgeForOpportunity } from "@/lib/ai/retrieval";
import { generateDraftEmail } from "@/lib/ai/generation";
import { isOpenRouterConfigured } from "@/lib/ai/openrouter-client";
import { logger } from "@/lib/logger";

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
  async ({ event, step, runId }) => {
    const { draftId, workspaceId, opportunityId } = event.data as DraftGenerateData;
    const log = logger.child({ runId, workspaceId, draftId, opportunityId });

    log.info("generate_draft_started");

    // ── Step 1: Mark as running ──────────────────────────────────────────
    const opportunity = await step.run("mark-running", async () => {
      const db = getDb();

      // Scoped by workspace as well as id: every row this workflow touches is
      // addressed by an id taken from the event payload, so the workspace it
      // claims to belong to is worth verifying rather than trusting — the API
      // routes scope every equivalent lookup the same way.
      const draft = await db.query.drafts.findFirst({
        where: and(eq(drafts.id, draftId), eq(drafts.workspaceId, workspaceId)),
      });

      if (!draft) {
        throw new NonRetriableError(`Draft ${draftId} not found in workspace ${workspaceId}.`);
      }

      const opp = await db.query.opportunities.findFirst({
        where: and(
          eq(opportunities.id, opportunityId),
          eq(opportunities.workspaceId, workspaceId),
        ),
      });

      if (!opp) {
        throw new NonRetriableError(
          `Opportunity ${opportunityId} not found in workspace ${workspaceId}.`,
        );
      }

      await db
        .update(drafts)
        .set({ generationStatus: "running", updatedAt: new Date() })
        .where(and(eq(drafts.id, draftId), eq(drafts.workspaceId, workspaceId)));

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
    //    Grounded generation via the configured OpenRouter generation model
    //    using normalized opportunity data plus the retrieved knowledge items.
    const generated = await step.run("generate-content", async () => {
      if (!isOpenRouterConfigured()) {
        // Draft generation has no non-AI fallback — fail fast rather than
        // burning retries on a permanent configuration problem.
        throw new NonRetriableError(
          "OPENROUTER_API_KEY must be set to generate drafts.",
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

      await insertNextDraftVersion({
        draftId,
        workspaceId,
        subject: generated.subject,
        body: generated.body,
        groundingRefs: generated.groundingRefs,
        source: "ai_generated",
      });

      await db
        .update(drafts)
        .set({ state: "draft_generated", generationStatus: "completed", updatedAt: new Date() })
        .where(and(eq(drafts.id, draftId), eq(drafts.workspaceId, workspaceId)));
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

    log.info("generate_draft_completed", { groundingRefsCount: generated.groundingRefs.length });

    return { draftId, groundingRefsCount: generated.groundingRefs.length };
  },
);

/**
 * Failure hook — marks the draft as failed and records an activity.
 */
export const onGenerateDraftFailure = createFailureHandler<DraftGenerateData>({
  id: "on-generate-draft-failure",
  name: "Handle Draft Generation Failure",
  eventName: DRAFT_GENERATE_EVENT,
  logMessage: "generate_draft_failed",
  onFailure: async ({ draftId, workspaceId }, errorMessage) => {
    const db = getDb();
    await db
      .update(drafts)
      .set({ generationStatus: "failed", generationError: errorMessage, updatedAt: new Date() })
      .where(and(eq(drafts.id, draftId), eq(drafts.workspaceId, workspaceId)));

    await recordActivity({
      workspaceId,
      kind: "draft.generation_failed",
      entityType: "draft",
      entityId: draftId,
      payload: { error: errorMessage },
    });
  },
});
