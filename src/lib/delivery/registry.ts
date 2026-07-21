import { gmailDraftProvider } from "./providers/gmail-draft";
import { manualExportProvider } from "./providers/manual-export";
import type { DeliveryProvider, DeliveryProviderKey } from "./provider";

export const deliveryProviders: Record<DeliveryProviderKey, DeliveryProvider> = {
  gmail_draft: gmailDraftProvider,
  manual_export: manualExportProvider,
};
