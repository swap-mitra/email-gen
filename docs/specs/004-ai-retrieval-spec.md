# 004 AI + Retrieval Spec

## Goal

Define the AI system used for extraction, retrieval, and email drafting.

## Chosen defaults

- Drafting model: `nvidia/nemotron-3-super-120b-a12b:free` (OpenRouter, override via `OPENROUTER_GENERATION_MODEL`)
- Extraction model: `openai/gpt-oss-20b:free` (OpenRouter, override via `OPENROUTER_EXTRACTION_MODEL`)
- Embedding model: `nvidia/llama-nemotron-embed-vl-1b-v2:free` (OpenRouter, override via `OPENROUTER_EMBEDDING_MODEL`) at 2048 dimensions — the only free embedding model on OpenRouter; multimodal (vision+text), not purpose-built for text embeddings
- Vector store: `pgvector` (Neon-hosted) — indexed as `halfvec`, not `vector`. pgvector's `vector` index types (HNSW/IVFFlat) cap at 2000 dimensions; this model's 2048-dim output exceeds that, so the HNSW index and retrieval queries cast to `halfvec(2048)` instead (half-precision storage, up to 4000 dims, pgvector's own recommended fix for this case — negligible precision loss for cosine-similarity ranking). The underlying column is still `real[]`; only the index expression and query casts differ. See `drizzle/0003_embedding_hnsw_index_halfvec.sql`.
- All three roles use a single `OPENROUTER_API_KEY`. OpenRouter's free-tier catalog rotates frequently — model choices are env-var overridable rather than hardcoded assumptions.

## Algorithms

- Structured extraction via schema-constrained generation
- Hybrid retrieval:
  - metadata filters
  - lexical search
  - vector similarity
  - reciprocal rank fusion
  - maximal marginal relevance to reduce duplicates
- Grounded generation using normalized opportunity data plus retrieved knowledge items

## Output requirements

- Extraction must produce validated typed objects
- Drafts must persist the knowledge items used for grounding
- OpenRouter's free models have unreliable support for strict `json_schema` structured outputs, so extraction/generation use loose `response_format: json_object` mode plus a Zod-derived JSON Schema description appended to the system prompt (via `z.toJSONSchema`) — `json_object` mode alone only guarantees valid JSON, not any particular shape, so without this the model invents its own field names. Client-side Zod validation follows, with one automatic repair retry on invalid output (and one verbatim retry on a network/empty-response failure) before failing
- Verified 2026-07-20 against live OpenRouter models: `openai/gpt-oss-20b:free` (extraction), `nvidia/nemotron-3-super-120b-a12b:free` (generation), `nvidia/llama-nemotron-embed-vl-1b-v2:free` (embeddings, confirmed 2048 dimensions) — all three produced schema-valid output through the real `chatJson`/`embedContent` code paths
