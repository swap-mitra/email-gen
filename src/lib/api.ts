import { NextResponse } from "next/server";
import { apiErrorSchema, type ApiErrorCode } from "@/lib/contracts/api";

type CreateApiErrorArgs = {
  code: ApiErrorCode;
  message: string;
  status: number;
  details?: Record<string, unknown>;
};

export function createApiErrorResponse({
  code,
  message,
  status,
  details,
}: CreateApiErrorArgs) {
  const payload = apiErrorSchema.parse({
    error: {
      code,
      message,
      requestId: crypto.randomUUID(),
      details,
    },
  });

  return NextResponse.json(payload, { status });
}
