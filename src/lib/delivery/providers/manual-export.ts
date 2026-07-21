import type { CreateDraftResult, DeliveryProvider } from "../provider";

/** No-op provider — records the export intent without an external call. */
export const manualExportProvider: DeliveryProvider = {
  key: "manual_export",

  async createDraft(): Promise<CreateDraftResult> {
    return { providerRef: null, externalAccountEmail: null };
  },
};
