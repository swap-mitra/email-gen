import { NonRetriableError } from "inngest";
import { eq } from "drizzle-orm";
import { inngest, OPPORTUNITY_INGEST_EVENT, type OpportunityIngestData } from "@/lib/inngest";
import { opportunities } from "@/db/schema";
import { recordActivity } from "@/lib/activity";
import { getDb } from "@/lib/db";
import { fetchAndExtractContent, extractNormalizedFields } from "@/lib/ingestion/fetch-content";
import { browserbaseFetch } from "@/lib/ingestion/browser-fallback";
import { persistRawHtmlArtifact } from "@/lib/ingestion/persist-artifact";

// ---------------------------------------------------------------------------
// ingest-opportunity — full P3+P4 durable step function
// ---------------------------------------------------------------------------

export const ingestOpportunity = inngest.createFunction(
  {
    id: "ingest-opportunity",
    name: "Ingest Opportunity",
    retries: 3,
    triggers: [{ event: OPPORTUNITY_INGEST_EVENT }],
    // One run at a time per opportunity — prevents duplicate parallel ingests
    concurrency: {
      limit: 1,
      key: "event.data.opportunityId",
    },
  },
  async ({ event, step }) => {
    const { opportunityId, workspaceId, attempt } = event.data as OpportunityIngestData;

    // ── Step 1: Mark as running ──────────────────────────────────────────
    await step.run("mark-running", async () => {
      const db = getDb();
      await db
        .update(opportunities)
        .set({ ingestStatus: "running", updatedAt: new Date() })
        .where(eq(opportunities.id, opportunityId));

      await recordActivity({
        workspaceId,
        kind: "opportunity.ingest_started",
        entityType: "opportunity",
        entityId: opportunityId,
        payload: { attempt },
      });
    });

    // ── Step 2: Direct fetch + HTML extraction ───────────────────────────
    const directResult = await step.run("fetch-and-extract", async () => {
      const db = getDb();

      const opportunity = await db.query.opportunities.findFirst({
        where: eq(opportunities.id, opportunityId),
      });

      if (!opportunity) {
        throw new NonRetriableError(
          `Opportunity ${opportunityId} not found — aborting ingestion.`,
        );
      }

      let content;
      try {
        content = await fetchAndExtractContent(opportunity.sourceUrl);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Direct fetch failed: ${message}`);
      }

      if (content.statusCode >= 400) {
        throw new NonRetriableError(
          `Source URL returned HTTP ${content.statusCode} — cannot ingest.`,
        );
      }

      // Persist raw HTML artifact (non-fatal if Blob is not configured)
      const rawHtmlBlobUrl = await persistRawHtmlArtifact(
        opportunityId,
        content.rawHtml,
        "direct",
      );

      return {
        text: content.text,
        title: content.title,
        description: content.description,
        isInsufficient: content.isInsufficient,
        sourceUrl: opportunity.sourceUrl,
        rawHtmlBlobUrl,
      };
    });

    // ── Step 3: Browser fallback via Browserbase ─────────────────────────
    //    Triggered only when direct fetch produces insufficient text content.
    //    Gracefully skipped if Browserbase credentials are not configured.
    const browserResult = await step.run("browser-fallback", async () => {
      // Fast path: direct fetch was sufficient
      if (!directResult.isInsufficient) {
        return { used: false, ...directResult };
      }

      const hasBrowserbaseConfig =
        !!process.env.BROWSERBASE_API_KEY && !!process.env.BROWSERBASE_PROJECT_ID;

      if (!hasBrowserbaseConfig) {
        await recordActivity({
          workspaceId,
          kind: "opportunity.browser_fallback_skipped",
          entityType: "opportunity",
          entityId: opportunityId,
          payload: {
            reason: "BROWSERBASE_API_KEY or BROWSERBASE_PROJECT_ID not configured",
            directTextLength: directResult.text.length,
          },
        });
        return { used: false, ...directResult };
      }

      // Run browser fallback
      let fallback;
      try {
        fallback = await browserbaseFetch(directResult.sourceUrl);
      } catch (err) {
        // Browser fallback failure is non-fatal — we continue with direct result
        const message = err instanceof Error ? err.message : String(err);
        await recordActivity({
          workspaceId,
          kind: "opportunity.browser_fallback_failed",
          entityType: "opportunity",
          entityId: opportunityId,
          payload: { error: message, directTextLength: directResult.text.length },
        });
        return { used: false, ...directResult };
      }

      // Persist browser-rendered HTML artifact
      const rawHtmlBlobUrl = await persistRawHtmlArtifact(
        opportunityId,
        fallback.rawHtml,
        "browser",
      );

      await recordActivity({
        workspaceId,
        kind: "opportunity.browser_fallback_used",
        entityType: "opportunity",
        entityId: opportunityId,
        payload: {
          sessionId: fallback.sessionId,
          textLength: fallback.text.length,
          isInsufficient: fallback.isInsufficient,
        },
      });

      return {
        used: true,
        text: fallback.text,
        title: fallback.title ?? directResult.title,
        description: fallback.description ?? directResult.description,
        isInsufficient: fallback.isInsufficient,
        sourceUrl: directResult.sourceUrl,
        rawHtmlBlobUrl: rawHtmlBlobUrl ?? directResult.rawHtmlBlobUrl,
        sessionId: fallback.sessionId,
      };
    });

    // ── Step 4: Persist structured result ───────────────────────────────
    await step.run("persist-result", async () => {
      const db = getDb();

      // Build normalized fields from whichever result we ended up with
      const normalizedFields = extractNormalizedFields(
        {
          rawHtml: "",              // rawHtml already stored in blob; not needed here
          text: browserResult.text,
          title: browserResult.title,
          description: browserResult.description,
          isInsufficient: browserResult.isInsufficient,
          statusCode: 200,
        },
        browserResult.sourceUrl,
      );

      await db
        .update(opportunities)
        .set({
          ingestStatus: "completed",
          rawContent: browserResult.text,
          normalizedFields,
          extractionMeta: {
            textLength: browserResult.text.length,
            isInsufficient: browserResult.isInsufficient,
            usedBrowserFallback: browserResult.used,
            rawHtmlBlobUrl: browserResult.rawHtmlBlobUrl ?? null,
            attempt,
            ingestedAt: new Date().toISOString(),
          },
          ingestError: null,
          updatedAt: new Date(),
        })
        .where(eq(opportunities.id, opportunityId));
    });

    // ── Step 5: Log completion ───────────────────────────────────────────
    await step.run("log-completion", async () => {
      await recordActivity({
        workspaceId,
        kind: "opportunity.ingest_completed",
        entityType: "opportunity",
        entityId: opportunityId,
        payload: {
          textLength: browserResult.text.length,
          isInsufficient: browserResult.isInsufficient,
          usedBrowserFallback: browserResult.used,
          attempt,
        },
      });
    });

    return {
      opportunityId,
      textLength: browserResult.text.length,
      usedBrowserFallback: browserResult.used,
    };
  },
);

// ---------------------------------------------------------------------------
// Failure hook — fires when all retries are exhausted
// ---------------------------------------------------------------------------

export const onIngestFailure = inngest.createFunction(
  {
    id: "on-ingest-opportunity-failure",
    name: "Handle Ingest Failure",
    triggers: [{ event: "inngest/function.failed" }],
  },
  async ({ event, step }) => {
    const original = (event.data as Record<string, unknown>).event as {
      name: string;
      data: OpportunityIngestData;
    };
    if (original.name !== OPPORTUNITY_INGEST_EVENT) return;

    const { opportunityId, workspaceId } = original.data;
    const errorMessage =
      ((event.data as Record<string, unknown>).error as { message?: string })
        ?.message ?? "Unknown error";

    await step.run("mark-failed", async () => {
      const db = getDb();
      await db
        .update(opportunities)
        .set({
          ingestStatus: "failed",
          ingestError: errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(opportunities.id, opportunityId));

      await recordActivity({
        workspaceId,
        kind: "opportunity.ingest_failed",
        entityType: "opportunity",
        entityId: opportunityId,
        payload: { error: errorMessage },
      });
    });
  },
);
