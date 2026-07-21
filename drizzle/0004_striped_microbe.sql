CREATE TABLE "delivery_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"clerk_user_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_account_email" text,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_accounts_workspace_user_provider_key" UNIQUE("workspace_id","clerk_user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "send_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"send_job_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" text NOT NULL,
	"provider_ref" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "send_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"draft_version_id" uuid NOT NULL,
	"delivery_account_id" uuid,
	"provider" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_ref" text,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"requested_by_clerk_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delivery_accounts" ADD CONSTRAINT "delivery_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send_attempts" ADD CONSTRAINT "send_attempts_send_job_id_send_jobs_id_fk" FOREIGN KEY ("send_job_id") REFERENCES "public"."send_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send_attempts" ADD CONSTRAINT "send_attempts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send_jobs" ADD CONSTRAINT "send_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send_jobs" ADD CONSTRAINT "send_jobs_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send_jobs" ADD CONSTRAINT "send_jobs_draft_version_id_draft_versions_id_fk" FOREIGN KEY ("draft_version_id") REFERENCES "public"."draft_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send_jobs" ADD CONSTRAINT "send_jobs_delivery_account_id_delivery_accounts_id_fk" FOREIGN KEY ("delivery_account_id") REFERENCES "public"."delivery_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_accounts_workspace_id_idx" ON "delivery_accounts" ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_accounts_clerk_user_id_idx" ON "delivery_accounts" ("clerk_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "send_jobs_workspace_id_idx" ON "send_jobs" ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "send_jobs_draft_id_idx" ON "send_jobs" ("draft_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "send_jobs_status_idx" ON "send_jobs" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "send_attempts_send_job_id_idx" ON "send_attempts" ("send_job_id");