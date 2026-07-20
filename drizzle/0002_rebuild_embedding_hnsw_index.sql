-- SUPERSEDED by 0003_embedding_hnsw_index_halfvec.sql — the CREATE INDEX
-- below fails on any Postgres ("column cannot have more than 2000
-- dimensions for hnsw index"; pgvector's `vector` index types cap at 2000
-- dims and this model is 2048) and was never successfully applied anywhere.
-- Kept here only as a historical record; see 0003 for the working fix.
--
-- Rebuild the embedding HNSW index for the new OpenRouter embedding model
-- (nvidia/llama-nemotron-embed-vl-1b-v2:free), replacing gemini-embedding-001.
-- Dimension confirmed via a live call to POST /api/v1/embeddings: 2048.
DROP INDEX IF EXISTS "knowledge_items_embedding_hnsw_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_items_embedding_hnsw_idx"
  ON "knowledge_items"
  USING hnsw (((embedding)::vector(2048)) vector_cosine_ops);
--> statement-breakpoint
-- Existing embeddings (if any) are from the old model/dimension — clear and
-- re-queue them for re-embedding under the new model. Safe no-op if no rows
-- were ever embedded.
UPDATE "knowledge_items" SET "embedding" = NULL, "embedded" = false WHERE "embedded" = true;
