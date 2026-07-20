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
