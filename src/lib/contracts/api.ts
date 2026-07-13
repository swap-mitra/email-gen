import { z } from "zod";

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

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("web"),
  version: z.number().int().positive(),
});

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

export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type WorkspaceContextResponse = z.infer<typeof workspaceContextResponseSchema>;
