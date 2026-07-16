import { NonRetriableError } from "inngest";
import { eq } from "drizzle-orm";
import { inngest, DRAFT_GENERATE_EVENT, type DraftGenerateData } from "@/lib/inngest";
import { drafts } from "@/db/schema";
import { recordActivity } from "@/lib/activity";
import { getDb } from "@/lib/db";

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
    await step.run("mark-running", async () => {
      const db = getDb();

      const draft = await db.query.drafts.findFirst({
        where: eq(drafts.id, draftId),
      });

      if (!draft) {
        throw new NonRetriableError(`Draft ${draftId} not found.`);
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
    });

    // ── Step 2: Retrieve knowledge (TODO p5) ─────────────────────────────
    // Will perform hybrid retrieval:
    //   - metadata filter by workspaceId
    //   - lexical search over knowledge_items.content
    //   - vector cosine similarity using pgvector
    //   - reciprocal rank fusion + maximal marginal relevance reranking
    const retrievedItems = await step.run("retrieve-knowledge", async () => {
      // TODO(p5): implement hybrid retrieval against knowledge_items
      return { items: [] as string[], stub: true };
    });

    // ── Step 3: Generate content (TODO p5) ───────────────────────────────
    // Will call OpenAI gpt-4o with:
    //   - system prompt: brand voice from workspace knowledge
    //   - user prompt: normalized opportunity fields
    //   - grounding context: retrieved knowledge items
    const generated = await step.run("generate-content", async () => {
      // TODO(p5): call OpenAI gpt-4o with retrieved knowledge and opportunity
      return {
        subject: null as string | null,
        body: null as string | null,
        groundingRefs: retrievedItems.items,
        stub: true,
      };
    });

    // ── Step 4: Persist draft version (TODO p5) ──────────────────────────
    await step.run("persist-version", async () => {
      if (generated.stub) {
        // Leave in pending state until P5 so UI shows a clear "pending AI" status
        const db = getDb();
        await db
          .update(drafts)
          .set({ generationStatus: "pending", updatedAt: new Date() })
          .where(eq(drafts.id, draftId));
        return;
      }
      // TODO(p5): insert draft_version with subject, body, groundingRefs
    });

    // ── Step 5: Log completion ───────────────────────────────────────────
    await step.run("log-completion", async () => {
      await recordActivity({
        workspaceId,
        kind: generated.stub ? "draft.generation_pending_ai" : "draft.generation_completed",
        entityType: "draft",
        entityId: draftId,
        payload: {
          opportunityId,
          stub: generated.stub,
          groundingRefsCount: generated.groundingRefs.length,
        },
      });
    });

    return { draftId, stub: generated.stub };
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
