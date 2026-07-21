import { z } from "zod";

// ---------------------------------------------------------------------------
// Error envelope
// ---------------------------------------------------------------------------

export const apiErrorCodeSchema = z.enum([
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "rate_limited",
  "internal_error",
]);

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string().min(1),
    requestId: z.string().min(1),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("web"),
  version: z.number().int().positive(),
});

// ---------------------------------------------------------------------------
// Workspace / auth context
// ---------------------------------------------------------------------------

export const workspaceSummarySchema = z.object({
  id: z.string().uuid(),
  clerkOrganizationId: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const workspaceMembershipSchema = z.object({
  workspaceId: z.string().uuid(),
  clerkUserId: z.string().min(1),
  role: z.string().min(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const workspaceContextResponseSchema = z.object({
  workspace: workspaceSummarySchema,
  membership: workspaceMembershipSchema,
  viewer: z.object({
    clerkUserId: z.string().min(1),
    clerkOrganizationId: z.string().min(1),
  }),
});

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

export const ingestStatusSchema = z.enum(["pending", "running", "completed", "failed"]);

export const createOpportunityRequestSchema = z.object({
  /** Public URL of the job posting or company page. */
  sourceUrl: z.string().url(),
});

export const opportunitySchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  sourceUrl: z.string().url(),
  ingestStatus: ingestStatusSchema,
  rawContent: z.string().nullable(),
  normalizedFields: z.record(z.string(), z.unknown()).nullable(),
  extractionMeta: z.record(z.string(), z.unknown()).nullable(),
  ingestError: z.string().nullable(),
  ingestAttempts: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ---------------------------------------------------------------------------
// Knowledge items
// ---------------------------------------------------------------------------

export const createKnowledgeItemRequestSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  /** Arbitrary metadata attached to this knowledge item (tags, source URL, etc.) */
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const knowledgeItemSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  meta: z.record(z.string(), z.unknown()),
  /** Whether an embedding vector has been generated for this item. */
  embedded: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ---------------------------------------------------------------------------
// Delivery / send jobs
// ---------------------------------------------------------------------------

export const deliveryProviderKeySchema = z.enum(["gmail_draft", "manual_export"]);
export const sendJobStatusSchema = z.enum(["pending", "running", "completed", "failed"]);

export const sendJobSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  draftId: z.string().uuid(),
  draftVersionId: z.string().uuid(),
  deliveryAccountId: z.string().uuid().nullable(),
  provider: deliveryProviderKeySchema,
  status: sendJobStatusSchema,
  providerRef: z.string().nullable(),
  error: z.string().nullable(),
  attempts: z.number().int(),
  requestedByClerkUserId: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const exportDraftRequestSchema = z.object({
  /** Defaults to "gmail_draft" when omitted. */
  provider: deliveryProviderKeySchema.optional(),
});

export const exportDraftResponseSchema = sendJobSchema.extend({
  /** Resolved external account address, for display only. */
  externalAccountEmail: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Drafts & versions
// ---------------------------------------------------------------------------

export const generationStatusSchema = z.enum(["pending", "running", "completed", "failed"]);
export const draftSourceSchema = z.enum(["ai_generated", "human_revised"]);

export const createDraftRequestSchema = z.object({
  opportunityId: z.string().uuid(),
});

export const reviseDraftRequestSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
});

export const draftVersionSchema = z.object({
  id: z.string().uuid(),
  draftId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  subject: z.string(),
  body: z.string(),
  /** IDs of knowledge_items used to ground this version. */
  groundingRefs: z.array(z.string().uuid()),
  source: draftSourceSchema,
  authorClerkUserId: z.string().nullable(),
  createdAt: z.coerce.date(),
});

export const draftSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  opportunityId: z.string().uuid(),
  state: z.string(),
  generationStatus: generationStatusSchema,
  generationError: z.string().nullable(),
  /** The most recent version, if any has been generated. */
  latestVersion: draftVersionSchema.nullable(),
  /** Most recent export attempt, if any — optional so list/create routes
   * that don't fetch it keep parsing unchanged. */
  latestSendJob: sendJobSchema.nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

/** Draft plus the knowledge items behind its latest version's groundingRefs. */
export const draftDetailSchema = draftSchema.extend({
  evidence: z.array(knowledgeItemSchema),
});

// ---------------------------------------------------------------------------
// List responses
// ---------------------------------------------------------------------------

export const opportunityListResponseSchema = z.object({
  items: z.array(opportunitySchema),
});

export const knowledgeItemListResponseSchema = z.object({
  items: z.array(knowledgeItemSchema),
});

/** Draft list row — carries enough of the opportunity to render a queue. */
export const draftListItemSchema = draftSchema.extend({
  opportunity: z.object({
    id: z.string().uuid(),
    sourceUrl: z.string().url(),
  }),
});

export const draftListResponseSchema = z.object({
  items: z.array(draftListItemSchema),
});

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export const approveDraftRequestSchema = z.object({
  /** Optional reviewer note attached to the approval. */
  note: z.string().optional(),
});

export const approvalSchema = z.object({
  id: z.string().uuid(),
  draftId: z.string().uuid(),
  draftVersionId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  reviewerClerkUserId: z.string(),
  note: z.string().nullable(),
  createdAt: z.coerce.date(),
});

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export const activitySchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  actorClerkUserId: z.string().nullable(),
  kind: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.coerce.date(),
});

export const activitiesResponseSchema = z.object({
  items: z.array(activitySchema),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type WorkspaceContextResponse = z.infer<typeof workspaceContextResponseSchema>;
export type IngestStatus = z.infer<typeof ingestStatusSchema>;
export type CreateOpportunityRequest = z.infer<typeof createOpportunityRequestSchema>;
export type OpportunityResponse = z.infer<typeof opportunitySchema>;
export type CreateKnowledgeItemRequest = z.infer<typeof createKnowledgeItemRequestSchema>;
export type KnowledgeItemResponse = z.infer<typeof knowledgeItemSchema>;
export type GenerationStatus = z.infer<typeof generationStatusSchema>;
export type CreateDraftRequest = z.infer<typeof createDraftRequestSchema>;
export type ReviseDraftRequest = z.infer<typeof reviseDraftRequestSchema>;
export type DraftVersionResponse = z.infer<typeof draftVersionSchema>;
export type DraftResponse = z.infer<typeof draftSchema>;
export type DraftDetailResponse = z.infer<typeof draftDetailSchema>;
export type OpportunityListResponse = z.infer<typeof opportunityListResponseSchema>;
export type KnowledgeItemListResponse = z.infer<typeof knowledgeItemListResponseSchema>;
export type DraftListItemResponse = z.infer<typeof draftListItemSchema>;
export type DraftListResponse = z.infer<typeof draftListResponseSchema>;
export type ApproveDraftRequest = z.infer<typeof approveDraftRequestSchema>;
export type ApprovalResponse = z.infer<typeof approvalSchema>;
export type DeliveryProviderKeyValue = z.infer<typeof deliveryProviderKeySchema>;
export type SendJobStatus = z.infer<typeof sendJobStatusSchema>;
export type SendJobResponse = z.infer<typeof sendJobSchema>;
export type ExportDraftRequest = z.infer<typeof exportDraftRequestSchema>;
export type ExportDraftResponse = z.infer<typeof exportDraftResponseSchema>;
export type ActivityResponse = z.infer<typeof activitySchema>;
export type ActivitiesResponse = z.infer<typeof activitiesResponseSchema>;
