import { embedBatch } from "@/lib/ai/openai-client";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

/** Embeds a single piece of text. Throws if OPENAI_API_KEY is not configured. */
export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedBatch([text], EMBEDDING_MODEL);
  return vector;
}

/** Embeds multiple texts in one request, preserving input order. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  return embedBatch(texts, EMBEDDING_MODEL);
}
