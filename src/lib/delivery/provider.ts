export type DeliveryProviderKey = "gmail_draft" | "manual_export";

export type CreateDraftInput = {
  clerkUserId: string;
  subject: string;
  body: string;
  /** Recipient, if known from the opportunity's extracted contact info. */
  toEmail: string | null;
};

export type CreateDraftResult = {
  /** External reference for the created draft (e.g. Gmail draft ID). */
  providerRef: string | null;
  /** Resolved external account address, for audit/display only. */
  externalAccountEmail: string | null;
};

export interface DeliveryProvider {
  readonly key: DeliveryProviderKey;
  createDraft(input: CreateDraftInput): Promise<CreateDraftResult>;
}
