import { describe, expect, it } from "vitest";
import {
  inngest,
  OPPORTUNITY_INGEST_EVENT,
  DRAFT_GENERATE_EVENT,
  KNOWLEDGE_ITEM_EMBED_EVENT,
} from "@/lib/inngest";
import { ingestOpportunity, onIngestFailure } from "@/lib/workflows/ingest-opportunity";
import { generateDraft, onGenerateDraftFailure } from "@/lib/workflows/generate-draft";
import {
  embedKnowledgeItem,
  onEmbedKnowledgeItemFailure,
} from "@/lib/workflows/embed-knowledge-item";

describe("P3 Async Workflows (Inngest)", () => {
  it("defines the correct event constants", () => {
    expect(OPPORTUNITY_INGEST_EVENT).toBe("groundwork/opportunity.ingest");
    expect(DRAFT_GENERATE_EVENT).toBe("groundwork/draft.generate");
  });

  it("configures Inngest client with correct app id", () => {
    expect(inngest.id).toBe("groundwork");
  });

  it("registers ingestOpportunity function with correct triggers & options", () => {
    expect(ingestOpportunity.opts.id).toBe("ingest-opportunity");
    expect(ingestOpportunity.opts.retries).toBe(3);
    expect(ingestOpportunity.opts.concurrency).toEqual({
      limit: 1,
      key: "event.data.opportunityId",
    });
  });

  it("registers generateDraft function with correct triggers & options", () => {
    expect(generateDraft.opts.id).toBe("generate-draft");
    expect(generateDraft.opts.retries).toBe(3);
    expect(generateDraft.opts.concurrency).toEqual({
      limit: 1,
      key: "event.data.draftId",
    });
  });

  it("registers failure hooks for both functions", () => {
    expect(onIngestFailure.opts.id).toBe("on-ingest-opportunity-failure");
    expect(onGenerateDraftFailure.opts.id).toBe("on-generate-draft-failure");
  });
});

describe("P5 AI + Retrieval — embed-knowledge-item workflow", () => {
  it("defines the correct event constant", () => {
    expect(KNOWLEDGE_ITEM_EMBED_EVENT).toBe("groundwork/knowledge-item.embed");
  });

  it("registers embedKnowledgeItem function with correct triggers & options", () => {
    expect(embedKnowledgeItem.opts.id).toBe("embed-knowledge-item");
    expect(embedKnowledgeItem.opts.retries).toBe(3);
    expect(embedKnowledgeItem.opts.concurrency).toEqual({
      limit: 1,
      key: "event.data.knowledgeItemId",
    });
  });

  it("registers a failure hook", () => {
    expect(onEmbedKnowledgeItemFailure.opts.id).toBe("on-embed-knowledge-item-failure");
  });
});
