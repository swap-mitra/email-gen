import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorSchema, type ApiErrorCode } from "@/lib/contracts/api";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Error responses
// ---------------------------------------------------------------------------

type CreateApiErrorArgs = {
  code: ApiErrorCode;
  message: string;
  status: number;
  details?: Record<string, unknown>;
  requestId?: string;
  /** The underlying error, if any — logged server-side but never sent to the client. */
  cause?: unknown;
};

export function createApiErrorResponse({
  code,
  message,
  status,
  details,
  requestId,
  cause,
}: CreateApiErrorArgs) {
  const resolvedRequestId = requestId ?? crypto.randomUUID();

  const payload = apiErrorSchema.parse({
    error: {
      code,
      message,
      requestId: resolvedRequestId,
      details,
    },
  });

  // Server errors are unexpected — log them for operator tracing. Client
  // errors (bad input, auth, not found, conflict) are expected control flow
  // and would just be noise in error monitoring.
  if (status >= 500) {
    logger.error("api_error", {
      requestId: resolvedRequestId,
      code,
      status,
      message,
      ...(cause !== undefined ? { error: cause } : {}),
    });
  }

  return NextResponse.json(payload, { status });
}

// ---------------------------------------------------------------------------
// Route wrapper
// ---------------------------------------------------------------------------

/**
 * Wraps a route handler so an uncaught error becomes a consistent
 * `internal_error` response instead of every handler repeating the same
 * try/catch.
 */
export function apiRoute<Args extends unknown[]>(
  fallbackMessage: string,
  handler: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      // Always the caller-supplied message, never error.message — an
      // unexpected throw here carries Postgres errors (query text included),
      // upstream API response bodies, and internal paths, none of which
      // belong in a client response. The real error goes to the log via
      // `cause`, correlated by requestId.
      return createApiErrorResponse({
        code: "internal_error",
        message: fallbackMessage,
        status: 500,
        cause: error,
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Request body parsing
// ---------------------------------------------------------------------------

/**
 * Safely parses and validates the JSON body of a request against a Zod schema.
 * Returns either validated data or a ready-to-return error NextResponse.
 */
export async function parseBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<{ data: z.infer<S>; error: null } | { data: null; error: NextResponse }> {
  let raw: unknown;

  try {
    raw = await req.json();
  } catch {
    return {
      data: null,
      error: createApiErrorResponse({
        code: "bad_request",
        message: "Request body must be valid JSON.",
        status: 400,
      }),
    };
  }

  const result = schema.safeParse(raw);

  if (!result.success) {
    return {
      data: null,
      error: createApiErrorResponse({
        code: "bad_request",
        message: "Invalid request body.",
        status: 400,
        details: result.error.flatten().fieldErrors as Record<string, unknown>,
      }),
    };
  }

  return { data: result.data, error: null };
}
