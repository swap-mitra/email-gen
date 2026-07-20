import { describe, expect, it, beforeEach } from "vitest";
import { reciprocalRankFusion, maximalMarginalRelevance } from "@/lib/ai/retrieval";
import { toNormalizedFields, aiExtractedFieldsSchema } from "@/lib/ai/extraction";
import { generatedDraftSchema, generateDraftEmail } from "@/lib/ai/generation";
import { embedQueryText, embedDocumentText, isEmbeddingConfigured } from "@/lib/ai/embeddings";
import { chatJson, isOpenRouterConfigured } from "@/lib/ai/openrouter-client";
import type { FetchedContent } from "@/lib/ingestion/fetch-content";

// ---------------------------------------------------------------------------
// openrouter-client.ts — configuration guard
// ---------------------------------------------------------------------------

describe("P5 AI — openrouter-client configuration guard", () => {
  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
  });

  it("reports unconfigured when OPENROUTER_API_KEY is not set", () => {
    expect(isOpenRouterConfigured()).toBe(false);
  });

  it("reports configured when OPENROUTER_API_KEY is set", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    expect(isOpenRouterConfigured()).toBe(true);
  });

  it("chatJson throws a descriptive error when unconfigured", async () => {
    await expect(
      chatJson({
        model: "openai/gpt-oss-20b:free",
        system: "system",
        user: "user",
        schema: generatedDraftSchema,
      }),
    ).rejects.toThrow("OPENROUTER_API_KEY must be set");
  });
});

// ---------------------------------------------------------------------------
// embeddings.ts — configuration guard (OpenRouter)
// ---------------------------------------------------------------------------

describe("P5 AI — embeddings configuration guard", () => {
  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
  });

  it("reports unconfigured when OPENROUTER_API_KEY is not set", () => {
    expect(isEmbeddingConfigured()).toBe(false);
  });

  it("reports configured when OPENROUTER_API_KEY is set", () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    expect(isEmbeddingConfigured()).toBe(true);
  });

  it("embedQueryText throws a descriptive error when unconfigured", async () => {
    await expect(embedQueryText("some query")).rejects.toThrow("OPENROUTER_API_KEY must be set");
  });

  it("embedDocumentText throws a descriptive error when unconfigured", async () => {
    await expect(embedDocumentText("some knowledge content")).rejects.toThrow(
      "OPENROUTER_API_KEY must be set",
    );
  });
});

// ---------------------------------------------------------------------------
// retrieval.ts — reciprocalRankFusion (pure)
// ---------------------------------------------------------------------------

describe("P5 AI — reciprocalRankFusion", () => {
  it("scores items higher when they rank well in multiple lists", () => {
    const scores = reciprocalRankFusion([
      ["a", "b", "c"],
      ["b", "a", "d"],
    ]);

    // "a" is rank 1 in list 1 and rank 2 in list 2 — highest combined score
    // "b" is rank 2 in list 1 and rank 1 in list 2 — same combined score as "a"
    expect(scores.get("a")).toBeCloseTo(scores.get("b")!, 10);
    expect(scores.get("a")!).toBeGreaterThan(scores.get("c")!);
    expect(scores.get("d")).toBeDefined();
    expect(scores.get("c")!).toBeGreaterThan(0);
  });

  it("only scores items that appear in at least one list", () => {
    const scores = reciprocalRankFusion([["x"], ["y"]]);
    expect(scores.size).toBe(2);
    expect(scores.has("z")).toBe(false);
  });

  it("returns an empty map for empty input lists", () => {
    const scores = reciprocalRankFusion([[], []]);
    expect(scores.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// retrieval.ts — maximalMarginalRelevance (pure)
// ---------------------------------------------------------------------------

describe("P5 AI — maximalMarginalRelevance", () => {
  it("prefers the most relevant candidate first", () => {
    const selected = maximalMarginalRelevance(
      [
        { id: "low", relevance: 0.1, embedding: [1, 0] },
        { id: "high", relevance: 0.9, embedding: [0, 1] },
      ],
      2,
    );
    expect(selected[0]).toBe("high");
  });

  it("penalizes near-duplicate embeddings in favor of diverse evidence", () => {
    // "dup" is nearly identical to "best" (already selected first),
    // while "diverse" is orthogonal — MMR should prefer diverse over dup
    // despite dup having slightly higher raw relevance.
    const selected = maximalMarginalRelevance(
      [
        { id: "best", relevance: 0.9, embedding: [1, 0] },
        { id: "dup", relevance: 0.85, embedding: [1, 0.01] },
        { id: "diverse", relevance: 0.5, embedding: [0, 1] },
      ],
      2,
      0.5,
    );

    expect(selected[0]).toBe("best");
    expect(selected[1]).toBe("diverse");
  });

  it("returns at most topK ids", () => {
    const selected = maximalMarginalRelevance(
      [
        { id: "a", relevance: 0.5, embedding: null },
        { id: "b", relevance: 0.4, embedding: null },
        { id: "c", relevance: 0.3, embedding: null },
      ],
      2,
    );
    expect(selected).toHaveLength(2);
  });

  it("handles candidates with null embeddings without throwing", () => {
    const selected = maximalMarginalRelevance(
      [
        { id: "a", relevance: 0.5, embedding: null },
        { id: "b", relevance: 0.4, embedding: null },
      ],
      2,
    );
    expect(selected).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// extraction.ts — toNormalizedFields (pure)
// ---------------------------------------------------------------------------

describe("P5 AI — toNormalizedFields", () => {
  const content: FetchedContent = {
    rawHtml: "",
    text: "a".repeat(1000),
    title: "Fallback Title",
    description: "Fallback description",
    isInsufficient: false,
    statusCode: 200,
  };

  it("prefers AI-extracted fields over fetched-content fallbacks", () => {
    const fields = aiExtractedFieldsSchema.parse({
      title: "Senior Engineer",
      company: "Acme Corp",
      location: "Remote",
      employmentType: "Full-time",
      summary: "Build distributed systems.",
      keyRequirements: ["TypeScript", "PostgreSQL"],
      contactEmail: "jobs@acme.com",
    });

    const normalized = toNormalizedFields(fields, content, "https://acme.com/jobs/1");

    expect(normalized.title).toBe("Senior Engineer");
    expect(normalized.description).toBe("Build distributed systems.");
    expect(normalized.company).toBe("Acme Corp");
    expect(normalized.keyRequirements).toEqual(["TypeScript", "PostgreSQL"]);
    expect(normalized.aiExtracted).toBe(true);
    expect((normalized.excerpt as string).length).toBe(800);
  });

  it("falls back to fetched content title/description when AI fields are null", () => {
    const fields = aiExtractedFieldsSchema.parse({
      title: null,
      company: null,
      location: null,
      employmentType: null,
      summary: null,
      keyRequirements: [],
      contactEmail: null,
    });

    const normalized = toNormalizedFields(fields, content, "https://acme.com/jobs/1");

    expect(normalized.title).toBe("Fallback Title");
    expect(normalized.description).toBe("Fallback description");
  });
});

// ---------------------------------------------------------------------------
// generation.ts — schema + configuration guard
// ---------------------------------------------------------------------------

describe("P5 AI — generateDraftEmail", () => {
  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
  });

  it("validates well-formed output against generatedDraftSchema", () => {
    const result = generatedDraftSchema.parse({
      subject: "Quick question about your open role",
      body: "Hi there, ...",
    });
    expect(result.subject).toContain("Quick question");
  });

  it("throws when OPENROUTER_API_KEY is not configured", async () => {
    await expect(
      generateDraftEmail({
        opportunity: { sourceUrl: "https://example.com", normalizedFields: null },
        knowledgeItems: [],
      }),
    ).rejects.toThrow("OPENROUTER_API_KEY must be set");
  });
});
