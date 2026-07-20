import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkOrganizationId: text("clerk_organization_id").notNull().unique(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const workspaceMemberships = pgTable(
  "workspace_memberships",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clerkUserId: text("clerk_user_id").notNull(),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workspaceId, table.clerkUserId] }),
  }),
);

// ---------------------------------------------------------------------------
// Opportunities
// Normalized source of truth for a lead / job opening.
// ---------------------------------------------------------------------------

export const opportunities = pgTable("opportunities", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),

  /** The original URL submitted by the user. */
  sourceUrl: text("source_url").notNull(),

  /**
   * Ingest status lifecycle:
   *   pending → running → completed | failed
   */
  ingestStatus: text("ingest_status").notNull().default("pending"),

  /** Raw HTML/markdown captured during ingestion. */
  rawContent: text("raw_content"),

  /** Structured extraction output (typed fields: title, company, description, …). */
  normalizedFields: jsonb("normalized_fields").$type<Record<string, unknown>>(),

  /** Extraction model output metadata (tokens, latency, etc.). */
  extractionMeta: jsonb("extraction_meta").$type<Record<string, unknown>>(),

  /** Human-readable failure reason when ingestStatus = 'failed'. */
  ingestError: text("ingest_error"),

  /** Number of ingest attempts so far. */
  ingestAttempts: integer("ingest_attempts").notNull().default(0),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Knowledge items
// Brand-voice documents, case studies, product info, etc. used for grounding.
// ---------------------------------------------------------------------------

export const knowledgeItems = pgTable("knowledge_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),

  /** Short descriptive title. */
  title: text("title").notNull(),

  /** Full text content. */
  content: text("content").notNull(),

  /** Optional metadata tags / source info. */
  meta: jsonb("meta").$type<Record<string, unknown>>().default({}).notNull(),

  /**
   * Embedding stored as a real[] array.
   * Dimensionality: see EMBEDDING_DIMENSIONS in src/lib/ai/embeddings.ts
   * (nvidia/llama-nemotron-embed-vl-1b-v2:free via OpenRouter).
   * Cast to vector in raw SQL for pgvector operations.
   */
  embedding: real("embedding").array(),

  /** True once the embedding has been generated. */
  embedded: boolean("embedded").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Drafts
// One draft per opportunity; draft versions are append-only.
// ---------------------------------------------------------------------------

export const drafts = pgTable("drafts", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  opportunityId: uuid("opportunity_id")
    .notNull()
    .references(() => opportunities.id, { onDelete: "cascade" }),

  /**
   * Workflow state — mirrors WorkflowState enum.
   * Transitions: knowledge_matched → draft_generated → draft_reviewed → approved_for_send
   */
  state: text("state").notNull().default("draft_generated"),

  /**
   * Generation status:
   *   pending → running → completed | failed
   */
  generationStatus: text("generation_status").notNull().default("pending"),

  /** Human-readable failure reason when generationStatus = 'failed'. */
  generationError: text("generation_error"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Draft versions
// Append-only log of every body revision.
// ---------------------------------------------------------------------------

export const draftVersions = pgTable("draft_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  draftId: uuid("draft_id")
    .notNull()
    .references(() => drafts.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),

  /** Sequential version number within the draft (1-based). */
  versionNumber: integer("version_number").notNull(),

  /** Email subject line. */
  subject: text("subject").notNull(),

  /** Email body — plain text or markdown. */
  body: text("body").notNull(),

  /**
   * IDs of the knowledge_items used to ground this version.
   * Preserves full RAG evidence chain.
   */
  groundingRefs: uuid("grounding_refs").array().notNull().default([]),

  /**
   * How this version was created:
   *   ai_generated | human_revised
   */
  source: text("source").notNull().default("ai_generated"),

  /** Clerk user ID of the person who created this version (null for AI). */
  authorClerkUserId: text("author_clerk_user_id"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Approvals
// Explicit reviewer-attributed approval record.
// ---------------------------------------------------------------------------

export const approvals = pgTable("approvals", {
  id: uuid("id").defaultRandom().primaryKey(),
  draftId: uuid("draft_id")
    .notNull()
    .references(() => drafts.id, { onDelete: "cascade" }),
  draftVersionId: uuid("draft_version_id")
    .notNull()
    .references(() => draftVersions.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),

  /** Clerk user ID of the reviewer who approved. */
  reviewerClerkUserId: text("reviewer_clerk_user_id").notNull(),

  /** Optional reviewer note. */
  note: text("note"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

export const activities = pgTable("activities", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  actorClerkUserId: text("actor_clerk_user_id"),
  kind: text("kind").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});


// ---------------------------------------------------------------------------
// Relations (TypeScript-only, no DDL)
// ---------------------------------------------------------------------------

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  memberships: many(workspaceMemberships),
  opportunities: many(opportunities),
  knowledgeItems: many(knowledgeItems),
  drafts: many(drafts),
  draftVersions: many(draftVersions),
  approvals: many(approvals),
  activities: many(activities),
}));

export const workspaceMembershipsRelations = relations(workspaceMemberships, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceMemberships.workspaceId],
    references: [workspaces.id],
  }),
}));

export const opportunitiesRelations = relations(opportunities, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [opportunities.workspaceId],
    references: [workspaces.id],
  }),
  drafts: many(drafts),
}));

export const knowledgeItemsRelations = relations(knowledgeItems, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [knowledgeItems.workspaceId],
    references: [workspaces.id],
  }),
}));

export const draftsRelations = relations(drafts, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [drafts.workspaceId],
    references: [workspaces.id],
  }),
  opportunity: one(opportunities, {
    fields: [drafts.opportunityId],
    references: [opportunities.id],
  }),
  versions: many(draftVersions),
  approvals: many(approvals),
}));

export const draftVersionsRelations = relations(draftVersions, ({ one }) => ({
  draft: one(drafts, {
    fields: [draftVersions.draftId],
    references: [drafts.id],
  }),
  workspace: one(workspaces, {
    fields: [draftVersions.workspaceId],
    references: [workspaces.id],
  }),
}));

export const approvalsRelations = relations(approvals, ({ one }) => ({
  draft: one(drafts, {
    fields: [approvals.draftId],
    references: [drafts.id],
  }),
  draftVersion: one(draftVersions, {
    fields: [approvals.draftVersionId],
    references: [draftVersions.id],
  }),
  workspace: one(workspaces, {
    fields: [approvals.workspaceId],
    references: [workspaces.id],
  }),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [activities.workspaceId],
    references: [workspaces.id],
  }),
}));

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceMembership = typeof workspaceMemberships.$inferSelect;
export type Opportunity = typeof opportunities.$inferSelect;
export type KnowledgeItem = typeof knowledgeItems.$inferSelect;
export type Draft = typeof drafts.$inferSelect;
export type DraftVersion = typeof draftVersions.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type Activity = typeof activities.$inferSelect;
