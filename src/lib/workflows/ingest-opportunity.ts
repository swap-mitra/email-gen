import { NonRetriableError } from "inngest";
import { eq } from "drizzle-orm";
import { inngest, OPPORTUNITY_INGEST_EVENT, type OpportunityIngestData } from "@/lib/inngest";
import { opportunities } from "@/db/schema";
import { recordActivity } from "@/lib/activity";
import { getDb } from "@/lib/db";
import { fetchAndExtractContent, extractNormalizedFields } from "@/lib/ingestion/fetch-content";

export const ingestOpportunity = inngest.createFunction(
  {
    id: "ingest-opportunity",
    name: "Ingest Opportunity",
    retries: 3,
    triggers: [{ event: OPPORTUNITY_INGEST_EVENT }],
    // Prevent concurrent runs for the same opportunity
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

    // ── Step 2: Fetch and extract content ────────────────────────────────
    const extracted = await step.run("fetch-and-extract", async () => {
      const db = getDb();

      const opportunity = await db.query.opportunities.findFirst({
        where: eq(opportunities.id, opportunityId),
      });

      if (!opportunity) {
        throw new NonRetriableError(
          `Opportunity ${opportunityId} not found — skipping ingestion.`,
        );
      }

      let content;
      try {
        content = await fetchAndExtractContent(opportunity.sourceUrl);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Fetch failed: ${message}`);
      }

      if (content.statusCode >= 400) {
        throw new NonRetriableError(
          `Source URL returned HTTP ${content.statusCode} — cannot ingest.`,
        );
      }

      return {
        rawHtml: content.rawHtml,
        text: content.text,
        title: content.title,
        description: content.description,
        isInsufficient: content.isInsufficient,
        sourceUrl: opportunity.sourceUrl,
      };
    });

    // ── Step 3: Browser fallback (Browserbase / Playwright) ─────────────
    //    Only triggered when direct fetch yields insufficient content.
    //    TODO(p4-browser): wire up Browserbase SDK when credentials are present.
    const usedBrowserFallback = await step.run("browser-fallback", async () => {
      if (!extracted.isInsufficient) return false;

      const hasBrowserbaseConfig =
        !!process.env.BROWSERBASE_API_KEY && !!process.env.BROWSERBASE_PROJECT_ID;

      if (!hasBrowserbaseConfig) {
        await recordActivity({
          workspaceId,
          kind: "opportunity.browser_fallback_skipped",
          entityType: "opportunity",
          entityId: opportunityId,
          payload: {
            reason: "BROWSERBASE_API_KEY not configured",
            textLength: extracted.text.length,
          },
        });
        return false;
      }

      // TODO(p4-browser): implement Browserbase session, navigate, extract
      return false;
    });

    // ── Step 4: Persist result ───────────────────────────────────────────
    await step.run("persist-result", async () => {
      const db = getDb();
      const normalizedFields = extractNormalizedFields(
        {
          rawHtml: extracted.rawHtml,
          text: extracted.text,
          title: extracted.title,
          description: extracted.description,
          isInsufficient: extracted.isInsufficient,
          statusCode: 200,
        },
        extracted.sourceUrl,
      );

      await db
        .update(opportunities)
        .set({
          ingestStatus: "completed",
          rawContent: extracted.text,
          normalizedFields,
          extractionMeta: {
            textLength: extracted.text.length,
            isInsufficient: extracted.isInsufficient,
            usedBrowserFallback,
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
          textLength: extracted.text.length,
          isInsufficient: extracted.isInsufficient,
          usedBrowserFallback,
          attempt,
        },
      });
    });

    return { opportunityId, textLength: extracted.text.length };
  },
);

/**
 * Failure hook — marks the opportunity as failed and records an activity.
 */
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
    if (original.name !== "email-gen/opportunity.ingest") return;

    const { opportunityId, workspaceId } = original.data;
    const errorMessage =
      ((event.data as Record<string, unknown>).error as { message?: string })?.message ??
      "Unknown error";

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
