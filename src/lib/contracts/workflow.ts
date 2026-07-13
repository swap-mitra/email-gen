import { z } from "zod";

export const workflowStateSchema = z.enum([
  "source_submitted",
  "ingestion_running",
  "opportunity_extracted",
  "knowledge_matched",
  "draft_generated",
  "draft_reviewed",
  "approved_for_send",
  "sent",
  "send_failed",
]);

export type WorkflowState = z.infer<typeof workflowStateSchema>;
