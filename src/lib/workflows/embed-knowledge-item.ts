import { NonRetriableError } from "inngest";
import { eq } from "drizzle-orm";
import { inngest, KNOWLEDGE_ITEM_EMBED_EVENT, type KnowledgeItemEmbedData } from "@/lib/inngest";
import { knowledgeItems } from "@/db/schema";
import { recordActivity } from "@/lib/activity";
import { getDb } from "@/lib/db";
import { embedText } from "@/lib/ai/embeddings";
import { isOpenAiConfigured } from "@/lib/ai/openai-client";

// ---------------------------------------------------------------------------
// embed-knowledge-item — P5 embedding step function
// ---------------------------------------------------------------------------

export const embedKnowledgeItem = inngest.createFunction(
  {
    id: "embed-knowledge-item",
    name: "Embed Knowledge Item",
    retries: 3,
    triggers: [{ event: KNOWLEDGE_ITEM_EMBED_EVENT }],
    // One run at a time per item — prevents duplicate parallel embedding calls
    concurrency: {
      limit: 1,
      key: "event.data.knowledgeItemId",
    },
  },
  async ({ event, step }) => {
    const { knowledgeItemId, workspaceId } = event.data as KnowledgeItemEmbedData;

    // ── Step 1: Skip gracefully when AI is not configured ────────────────
    //    Retrieval still works via lexical search alone; embedding is an
    //    enhancement, not a hard requirement — mirrors the Browserbase
    //    fallback's "skip, don't fail" behavior when unconfigured.
    const skipped = await step.run("check-configured", async () => {
      if (isOpenAiConfigured()) return false;

      await recordActivity({
        workspaceId,
        kind: "knowledge_item.embedding_skipped",
        entityType: "knowledge_item",
        entityId: knowledgeItemId,
        payload: { reason: "OPENAI_API_KEY not configured" },
      });
      return true;
    });

    if (skipped) {
      return { knowledgeItemId, skipped: true };
    }

    // ── Step 2: Embed and persist ─────────────────────────────────────────
    await step.run("embed-and-persist", async () => {
      const db = getDb();

      const item = await db.query.knowledgeItems.findFirst({
        where: eq(knowledgeItems.id, knowledgeItemId),
      });

      if (!item) {
        throw new NonRetriableError(`Knowledge item ${knowledgeItemId} not found.`);
      }

      const vector = await embedText(`${item.title}\n\n${item.content}`);

      await db
        .update(knowledgeItems)
        .set({ embedding: vector, embedded: true, updatedAt: new Date() })
        .where(eq(knowledgeItems.id, knowledgeItemId));

      await recordActivity({
        workspaceId,
        kind: "knowledge_item.embedded",
        entityType: "knowledge_item",
        entityId: knowledgeItemId,
        payload: { dimensions: vector.length },
      });
    });

    return { knowledgeItemId, skipped: false };
  },
);

// ---------------------------------------------------------------------------
// Failure hook — fires when all retries are exhausted
// ---------------------------------------------------------------------------

export const onEmbedKnowledgeItemFailure = inngest.createFunction(
  {
    id: "on-embed-knowledge-item-failure",
    name: "Handle Knowledge Item Embedding Failure",
    triggers: [{ event: "inngest/function.failed" }],
  },
  async ({ event, step }) => {
    const original = (event.data as Record<string, unknown>).event as {
      name: string;
      data: KnowledgeItemEmbedData;
    };
    if (original.name !== KNOWLEDGE_ITEM_EMBED_EVENT) return;

    const { knowledgeItemId, workspaceId } = original.data;
    const errorMessage =
      ((event.data as Record<string, unknown>).error as { message?: string })?.message ??
      "Unknown error";

    await step.run("log-failure", async () => {
      await recordActivity({
        workspaceId,
        kind: "knowledge_item.embedding_failed",
        entityType: "knowledge_item",
        entityId: knowledgeItemId,
        payload: { error: errorMessage },
      });
    });
  },
);
