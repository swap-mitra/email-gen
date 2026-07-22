import { createGmailDraft } from "../gmail-client";
import { getGoogleAccessToken } from "../google-token";
import type { CreateDraftInput, CreateDraftResult, DeliveryProvider } from "../provider";

export const gmailDraftProvider: DeliveryProvider = {
  key: "gmail_draft",

  async createDraft(input: CreateDraftInput): Promise<CreateDraftResult> {
    const { accessToken, email } = await getGoogleAccessToken(input.userId);
    const draft = await createGmailDraft({
      accessToken,
      to: input.toEmail,
      subject: input.subject,
      body: input.body,
    });
    return { providerRef: draft.id, externalAccountEmail: email };
  },
};
