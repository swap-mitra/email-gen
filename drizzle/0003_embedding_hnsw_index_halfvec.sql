-- Supersedes 0002's HNSW index: pgvector's index types (HNSW and IVFFlat)
-- cap indexed columns at 2000 dimensions for the `vector` type. This
-- embedding model produces 2048-dim vectors, so 0002's
-- `USING hnsw (((embedding)::vector(2048)) vector_cosine_ops)` fails outright
-- with "column cannot have more than 2000 dimensions for hnsw index" on any
-- Postgres — it was never successfully applied anywhere.
--
-- Fix: index on `halfvec` instead, which supports up to 4000 dimensions at
-- half-precision (float16) storage. Precision loss is negligible for cosine
-- similarity ranking and this is pgvector's own recommended approach for
-- vectors over 2000 dims. The underlying column stays `real[]` — only the
-- index expression and retrieval.ts's query casts change (vector -> halfvec).
DROP INDEX IF EXISTS "knowledge_items_embedding_hnsw_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_items_embedding_hnsw_idx"
  ON "knowledge_items"
  USING hnsw (((embedding)::halfvec(2048)) halfvec_cosine_ops);
