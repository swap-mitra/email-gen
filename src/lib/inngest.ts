import { Inngest } from "inngest";
import { logger } from "@/lib/logger";

export const OPPORTUNITY_INGEST_EVENT = "groundwork/opportunity.ingest" as const;
export const DRAFT_GENERATE_EVENT = "groundwork/draft.generate" as const;
export const KNOWLEDGE_ITEM_EMBED_EVENT = "groundwork/knowledge-item.embed" as const;

export const inngest = new Inngest({
  id: "groundwork",
  name: "Groundwork",
});

// Explicit payload types — used for event.data casts in workflow handlers
export type OpportunityIngestData = {
  opportunityId: string;
  workspaceId: string;
  /** 1-based attempt number — part of the idempotency key. */
  attempt: number;
};

export type DraftGenerateData = {
  draftId: string;
  workspaceId: string;
  opportunityId: string;
};

export type KnowledgeItemEmbedData = {
  knowledgeItemId: string;
  workspaceId: string;
};

/**
 * Builds an `inngest/function.failed` handler for one workflow's event.
 * Every workflow's failure hook does the same three things — unwrap the
 * failed run's original event/error, log it, then update domain state —
 * so only `onFailure` (the domain-specific update) needs to be supplied.
 */
export function createFailureHandler<TData>({
  id,
  name,
  eventName,
  logMessage,
  onFailure,
}: {
  id: string;
  name: string;
  eventName: string;
  logMessage: string;
  /** Runs inside a durable step; receives the original event data and the resolved error message. */
  onFailure: (data: TData, errorMessage: string) => Promise<void>;
}) {
  return inngest.createFunction(
    { id, name, triggers: [{ event: "inngest/function.failed" }] },
    async ({ event, step }) => {
      const failureData = event.data as Record<string, unknown>;
      const original = failureData.event as { name: string; data: TData };
      if (original.name !== eventName) return;

      const failedRunError = failureData.error as
        | { message?: string; name?: string; stack?: string }
        | undefined;
      const errorMessage = failedRunError?.message ?? "Unknown error";

      logger.error(logMessage, {
        runId: failureData.run_id,
        ...(original.data as Record<string, unknown>),
        errorMessage,
        errorName: failedRunError?.name,
        errorStack: failedRunError?.stack,
      });

      await step.run("mark-failed", () => onFailure(original.data, errorMessage));
    },
  );
}
