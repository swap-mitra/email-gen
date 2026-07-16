import { Inngest } from "inngest";

export const OPPORTUNITY_INGEST_EVENT = "email-gen/opportunity.ingest" as const;
export const DRAFT_GENERATE_EVENT = "email-gen/draft.generate" as const;

export const inngest = new Inngest({
  id: "email-gen",
  name: "Email GenAI",
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
