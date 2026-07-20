const OPENROUTER_API_URL = "https://openrouter.ai/api/v1";
const EMBEDDING_MODEL =
  process.env.OPENROUTER_EMBEDDING_MODEL ?? "nvidia/llama-nemotron-embed-vl-1b-v2:free";
const REQUEST_TIMEOUT_MS = 30_000;

// Confirmed via a live call to POST https://openrouter.ai/api/v1/embeddings
// with model nvidia/llama-nemotron-embed-vl-1b-v2:free — data[0].embedding.length === 2048.
export const EMBEDDING_DIMENSIONS = 2048;

export function isEmbeddingConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

function requireApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY must be set to use embeddings.");
  }
  return apiKey;
}

async function embedContent(text: string): Promise<number[]> {
  const apiKey = requireApiKey();

  const res = await fetch(`${OPENROUTER_API_URL}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter embeddings failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as { data?: { embedding: number[]; index: number }[] };
  const embedding = json.data?.[0]?.embedding;
  if (!embedding) {
    throw new Error("OpenRouter embeddings response did not include an embedding vector.");
  }
  return embedding;
}

/** Embeds a search query. Throws if OPENROUTER_API_KEY is not configured. */
export async function embedQueryText(text: string): Promise<number[]> {
  return embedContent(text);
}

/** Embeds a knowledge item for indexing. Throws if OPENROUTER_API_KEY is not configured. */
export async function embedDocumentText(text: string): Promise<number[]> {
  return embedContent(text);
}
