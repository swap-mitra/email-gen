import { NextResponse } from "next/server";
import { healthResponseSchema } from "@/lib/contracts/api";

export async function GET() {
  const payload = healthResponseSchema.parse({
    ok: true,
    service: "web",
    version: 1,
  });

  return NextResponse.json(payload);
}
