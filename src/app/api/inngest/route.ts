import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { ingestOpportunity, onIngestFailure } from "@/lib/workflows/ingest-opportunity";
import { generateDraft, onGenerateDraftFailure } from "@/lib/workflows/generate-draft";

/**
 * Inngest webhook handler.
 * Inngest calls GET to introspect available functions,
 * POST to deliver events, and PUT to register/sync.
 *
 * Local dev: run `npx inngest-cli@latest dev` to start the Inngest dev server.
 * The dev server auto-discovers this endpoint at /api/inngest.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    ingestOpportunity,
    onIngestFailure,
    generateDraft,
    onGenerateDraftFailure,
  ],
});
