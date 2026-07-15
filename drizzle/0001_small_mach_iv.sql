-- Enable pgvector extension (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"draft_version_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"reviewer_clerk_user_id" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "draft_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"grounding_refs" uuid[] DEFAULT '{}' NOT NULL,
	"source" text DEFAULT 'ai_generated' NOT NULL,
	"author_clerk_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"state" text DEFAULT 'draft_generated' NOT NULL,
	"generation_status" text DEFAULT 'pending' NOT NULL,
	"generation_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"embedding" real[],
	"embedded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_url" text NOT NULL,
	"ingest_status" text DEFAULT 'pending' NOT NULL,
	"raw_content" text,
	"normalized_fields" jsonb,
	"extraction_meta" jsonb,
	"ingest_error" text,
	"ingest_attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_draft_version_id_draft_versions_id_fk" FOREIGN KEY ("draft_version_id") REFERENCES "public"."draft_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_versions" ADD CONSTRAINT "draft_versions_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_versions" ADD CONSTRAINT "draft_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- HNSW index for approximate nearest-neighbour search on knowledge_items embeddings.
-- Requires the pgvector extension (enabled above).
-- Casts real[] to vector for the index expression.
CREATE INDEX IF NOT EXISTS "knowledge_items_embedding_hnsw_idx"
  ON "knowledge_items"
  USING hnsw (((embedding)::vector(1536)) vector_cosine_ops);
--> statement-breakpoint
-- Supporting indexes for common query patterns
CREATE INDEX IF NOT EXISTS "opportunities_workspace_id_idx" ON "opportunities" ("workspace_id");
CREATE INDEX IF NOT EXISTS "opportunities_ingest_status_idx" ON "opportunities" ("ingest_status");
CREATE INDEX IF NOT EXISTS "knowledge_items_workspace_id_idx" ON "knowledge_items" ("workspace_id");
CREATE INDEX IF NOT EXISTS "drafts_workspace_id_idx" ON "drafts" ("workspace_id");
CREATE INDEX IF NOT EXISTS "drafts_opportunity_id_idx" ON "drafts" ("opportunity_id");
CREATE INDEX IF NOT EXISTS "drafts_state_idx" ON "drafts" ("state");
CREATE INDEX IF NOT EXISTS "draft_versions_draft_id_idx" ON "draft_versions" ("draft_id");
CREATE INDEX IF NOT EXISTS "activities_workspace_id_idx" ON "activities" ("workspace_id");