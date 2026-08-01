-- Landing-page "Request access" submissions.
-- The unique index is load-bearing, not decorative: the public endpoint relies
-- on ON CONFLICT DO NOTHING against it to collapse repeat submissions to a
-- single admin notification.
CREATE TABLE IF NOT EXISTS "access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_requests_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "access_requests_created_at_idx" ON "access_requests" ("created_at");
