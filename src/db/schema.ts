import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth-schema";

export * from "./auth-schema";

// ---------------------------------------------------------------------------
// Tenancy
// A thin uuid-keyed mirror of Better-Auth's `organization` table — kept so
// the 9 domain tables below don't need a uuid->text FK migration just to
// point at Better-Auth's text-id organizations. Membership/role, by
// contrast, is sourced live from Better-Auth's own `member` table (see
// src/lib/workspaces.ts) rather than mirrored here.
// ---------------------------------------------------------------------------

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .unique()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

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

export const draftVersions = pgTable(
  "draft_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),

    /**
     * Sequential version number within the draft (1-based). Unique per draft —
     * see the constraint below; readers take the highest one, so a duplicate
     * would silently hide a revision rather than fail.
     */
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

    /** User who created this version (null for AI). */
    authorUserId: text("author_user_id").references(() => user.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    draftVersionNumberUnique: unique("draft_versions_draft_id_version_number_key").on(
      table.draftId,
      table.versionNumber,
    ),
  }),
);

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

  /** The reviewer who approved. */
  reviewerUserId: text("reviewer_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),

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
  actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Delivery accounts
// Thin, lazily-written audit/display record of which external account (e.g.
// Gmail address) a workspace member last exported to. The real OAuth token
// lives in Better-Auth's own `account` table — this table stays useful
// specifically because it's workspace-scoped audit/display data, which
// `account` (per-user, not per-workspace) doesn't provide.
// ---------------------------------------------------------------------------

export const deliveryAccounts = pgTable(
  "delivery_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    /** Mirrors DeliveryProviderKey. Only "gmail_draft" writes rows here. */
    provider: text("provider").notNull(),

    /** Resolved external account address, for audit/display only. */
    externalAccountEmail: text("external_account_email"),

    /** Timestamp of the most recent successful export via this account. */
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workspaceUserProviderUnique: unique("delivery_accounts_workspace_user_provider_key").on(
      table.workspaceId,
      table.userId,
      table.provider,
    ),
  }),
);

// ---------------------------------------------------------------------------
// Send jobs
// One row per export attempt, pinned to the exact draft version exported.
// ---------------------------------------------------------------------------

export const sendJobs = pgTable("send_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  draftId: uuid("draft_id")
    .notNull()
    .references(() => drafts.id, { onDelete: "cascade" }),
  draftVersionId: uuid("draft_version_id")
    .notNull()
    .references(() => draftVersions.id, { onDelete: "cascade" }),
  deliveryAccountId: uuid("delivery_account_id").references(() => deliveryAccounts.id, {
    onDelete: "set null",
  }),

  /** Mirrors DeliveryProviderKey ("gmail_draft" | "manual_export"). */
  provider: text("provider").notNull(),

  /**
   * Job status lifecycle:
   *   pending → running → completed | failed
   */
  status: text("status").notNull().default("pending"),

  /** External reference returned by the provider (e.g. Gmail draft ID). */
  providerRef: text("provider_ref"),

  /** Human-readable failure reason when status = 'failed'. */
  error: text("error"),

  /** Number of attempts recorded in send_attempts for this job. */
  attempts: integer("attempts").notNull().default(0),

  /** The user who triggered this export. */
  requestedByUserId: text("requested_by_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Send attempts
// Append-only log of each individual provider call underneath a send job.
// ---------------------------------------------------------------------------

export const sendAttempts = pgTable("send_attempts", {
  id: uuid("id").defaultRandom().primaryKey(),
  sendJobId: uuid("send_job_id")
    .notNull()
    .references(() => sendJobs.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),

  /** Sequential attempt number within the job (1-based). */
  attemptNumber: integer("attempt_number").notNull(),

  /** Terminal outcome of this specific provider call: succeeded | failed */
  status: text("status").notNull(),

  providerRef: text("provider_ref"),
  error: text("error"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Relations (TypeScript-only, no DDL)
// ---------------------------------------------------------------------------

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  opportunities: many(opportunities),
  knowledgeItems: many(knowledgeItems),
  drafts: many(drafts),
  draftVersions: many(draftVersions),
  approvals: many(approvals),
  activities: many(activities),
  deliveryAccounts: many(deliveryAccounts),
  sendJobs: many(sendJobs),
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
  sendJobs: many(sendJobs),
}));

export const draftVersionsRelations = relations(draftVersions, ({ one, many }) => ({
  draft: one(drafts, {
    fields: [draftVersions.draftId],
    references: [drafts.id],
  }),
  workspace: one(workspaces, {
    fields: [draftVersions.workspaceId],
    references: [workspaces.id],
  }),
  author: one(user, {
    fields: [draftVersions.authorUserId],
    references: [user.id],
  }),
  sendJobs: many(sendJobs),
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
  reviewer: one(user, {
    fields: [approvals.reviewerUserId],
    references: [user.id],
  }),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [activities.workspaceId],
    references: [workspaces.id],
  }),
  actor: one(user, {
    fields: [activities.actorUserId],
    references: [user.id],
  }),
}));

export const deliveryAccountsRelations = relations(deliveryAccounts, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [deliveryAccounts.workspaceId],
    references: [workspaces.id],
  }),
  user: one(user, {
    fields: [deliveryAccounts.userId],
    references: [user.id],
  }),
  sendJobs: many(sendJobs),
}));

export const sendJobsRelations = relations(sendJobs, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [sendJobs.workspaceId],
    references: [workspaces.id],
  }),
  draft: one(drafts, {
    fields: [sendJobs.draftId],
    references: [drafts.id],
  }),
  draftVersion: one(draftVersions, {
    fields: [sendJobs.draftVersionId],
    references: [draftVersions.id],
  }),
  deliveryAccount: one(deliveryAccounts, {
    fields: [sendJobs.deliveryAccountId],
    references: [deliveryAccounts.id],
  }),
  requestedBy: one(user, {
    fields: [sendJobs.requestedByUserId],
    references: [user.id],
  }),
  attempts: many(sendAttempts),
}));

export const sendAttemptsRelations = relations(sendAttempts, ({ one }) => ({
  sendJob: one(sendJobs, {
    fields: [sendAttempts.sendJobId],
    references: [sendJobs.id],
  }),
  workspace: one(workspaces, {
    fields: [sendAttempts.workspaceId],
    references: [workspaces.id],
  }),
}));

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type Workspace = typeof workspaces.$inferSelect;
export type Opportunity = typeof opportunities.$inferSelect;
export type KnowledgeItem = typeof knowledgeItems.$inferSelect;
export type Draft = typeof drafts.$inferSelect;
export type DraftVersion = typeof draftVersions.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type DeliveryAccount = typeof deliveryAccounts.$inferSelect;
export type SendJob = typeof sendJobs.$inferSelect;
export type SendAttempt = typeof sendAttempts.$inferSelect;
