import { sql, eq, and, inArray } from "drizzle-orm";
import { knowledgeItems, type KnowledgeItem } from "@/db/schema";
import { getDb } from "@/lib/db";
import { embedQueryText, isEmbeddingConfigured, EMBEDDING_DIMENSIONS } from "@/lib/ai/embeddings";

const vectorType = sql.raw(`vector(${EMBEDDING_DIMENSIONS})`);

const RRF_K = 60;
const LEXICAL_LIMIT = 20;
const VECTOR_LIMIT = 20;
const MMR_LAMBDA = 0.7;
const DEFAULT_TOP_K = 5;

// ---------------------------------------------------------------------------
// Reciprocal rank fusion — combines multiple ranked ID lists into one score.
// Pure function, unit-testable without a database.
// ---------------------------------------------------------------------------

export function reciprocalRankFusion(rankedLists: string[][], k = RRF_K): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of rankedLists) {
    list.forEach((id, idx) => {
      const rank = idx + 1;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
    });
  }
  return scores;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ---------------------------------------------------------------------------
// Maximal marginal relevance — greedily reranks fused candidates to reduce
// near-duplicate grounding evidence. Pure function, unit-testable.
// ---------------------------------------------------------------------------

export type MmrCandidate = {
  id: string;
  relevance: number;
  embedding: number[] | null;
};

export function maximalMarginalRelevance(
  candidates: MmrCandidate[],
  topK: number,
  lambda = MMR_LAMBDA,
): string[] {
  const pool = [...candidates];
  const selected: MmrCandidate[] = [];

  while (selected.length < topK && pool.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    pool.forEach((candidate, idx) => {
      const maxSimToSelected =
        selected.length === 0 || !candidate.embedding
          ? 0
          : Math.max(
              ...selected.map((s) =>
                s.embedding && candidate.embedding
                  ? cosineSimilarity(candidate.embedding, s.embedding)
                  : 0,
              ),
            );

      const mmrScore = lambda * candidate.relevance - (1 - lambda) * maxSimToSelected;
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = idx;
      }
    });

    selected.push(pool[bestIdx]);
    pool.splice(bestIdx, 1);
  }

  return selected.map((c) => c.id);
}

// ---------------------------------------------------------------------------
// Hybrid retrieval — metadata filter + lexical search + vector similarity,
// fused with RRF and reranked with MMR.
// ---------------------------------------------------------------------------

export async function retrieveKnowledgeForOpportunity(args: {
  workspaceId: string;
  queryText: string;
  topK?: number;
}): Promise<KnowledgeItem[]> {
  const { workspaceId, queryText, topK = DEFAULT_TOP_K } = args;
  const db = getDb();

  if (!queryText.trim()) return [];

  // ── Lexical search (Postgres full-text ranking) ─────────────────────────
  const lexicalRows = await db
    .select({ id: knowledgeItems.id })
    .from(knowledgeItems)
    .where(
      and(
        eq(knowledgeItems.workspaceId, workspaceId),
        sql`to_tsvector('english', ${knowledgeItems.title} || ' ' || ${knowledgeItems.content}) @@ plainto_tsquery('english', ${queryText})`,
      ),
    )
    .orderBy(
      sql`ts_rank(to_tsvector('english', ${knowledgeItems.title} || ' ' || ${knowledgeItems.content}), plainto_tsquery('english', ${queryText})) DESC`,
    )
    .limit(LEXICAL_LIMIT);

  const lexicalIds = lexicalRows.map((r) => r.id);

  // ── Vector search (pgvector cosine distance) — skipped gracefully when
  //    AI is not configured or embedding the query fails. ─────────────────
  let vectorIds: string[] = [];
  if (isEmbeddingConfigured()) {
    try {
      const queryEmbedding = await embedQueryText(queryText);
      const vectorLiteral = `[${queryEmbedding.join(",")}]`;
      const vectorRows = await db
        .select({ id: knowledgeItems.id })
        .from(knowledgeItems)
        .where(
          and(eq(knowledgeItems.workspaceId, workspaceId), eq(knowledgeItems.embedded, true)),
        )
        .orderBy(
          sql`(${knowledgeItems.embedding}::${vectorType}) <=> ${vectorLiteral}::${vectorType}`,
        )
        .limit(VECTOR_LIMIT);
      vectorIds = vectorRows.map((r) => r.id);
    } catch {
      vectorIds = [];
    }
  }

  if (lexicalIds.length === 0 && vectorIds.length === 0) {
    return [];
  }

  // ── Fuse rankings ─────────────────────────────────────────────────────
  const fusedScores = reciprocalRankFusion([lexicalIds, vectorIds]);
  const candidateIds = [...fusedScores.keys()];

  const rows = await db
    .select()
    .from(knowledgeItems)
    .where(
      and(eq(knowledgeItems.workspaceId, workspaceId), inArray(knowledgeItems.id, candidateIds)),
    );

  const byId = new Map(rows.map((r) => [r.id, r]));

  const candidates: MmrCandidate[] = candidateIds
    .map((id) => byId.get(id))
    .filter((r): r is KnowledgeItem => !!r)
    .map((r) => ({
      id: r.id,
      relevance: fusedScores.get(r.id) ?? 0,
      embedding: r.embedding,
    }));

  // ── MMR rerank to reduce near-duplicate grounding evidence ─────────────
  const finalIds = maximalMarginalRelevance(candidates, topK);
  return finalIds.map((id) => byId.get(id)).filter((r): r is KnowledgeItem => !!r);
}
