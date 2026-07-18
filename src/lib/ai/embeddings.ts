const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";
const EMBEDDING_MODEL = "gemini-embedding-001";
const REQUEST_TIMEOUT_MS = 30_000;

// Matches the pgvector column width (real[] cast to vector(1536)) — see
// drizzle/0001_small_mach_iv.sql. gemini-embedding-001 supports Matryoshka
// truncation to arbitrary output dimensions via `outputDimensionality`.
export const EMBEDDING_DIMENSIONS = 1536;

export function isEmbeddingConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

function requireApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY must be set to use embeddings.");
  }
  return apiKey;
}

async function embedContent(
  text: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
): Promise<number[]> {
  const apiKey = requireApiKey();

  const res = await fetch(`${GEMINI_API_URL}/models/${EMBEDDING_MODEL}:embedContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: EMBEDDING_DIMENSIONS,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini embedContent failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as { embedding: { values: number[] } };
  return json.embedding.values;
}

/** Embeds a search query. Throws if GEMINI_API_KEY is not configured. */
export async function embedQueryText(text: string): Promise<number[]> {
  return embedContent(text, "RETRIEVAL_QUERY");
}

/** Embeds a knowledge item for indexing. Throws if GEMINI_API_KEY is not configured. */
export async function embedDocumentText(text: string): Promise<number[]> {
  return embedContent(text, "RETRIEVAL_DOCUMENT");
}
