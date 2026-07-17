import * as cheerio from "cheerio";
import type { FetchedContent } from "./fetch-content";

const BROWSERBASE_API_URL = "https://api.browserbase.com/v1";
const NAVIGATION_TIMEOUT_MS = 30_000;
const POST_LOAD_WAIT_MS = 2_000;
const MIN_CONTENT_LENGTH = 400;

type BrowserbaseSession = {
  id: string;
  connectUrl: string;
};

export type BrowserFallbackResult = FetchedContent & {
  /** Browserbase session ID — useful for debugging in the Browserbase dashboard. */
  sessionId: string;
};

// ---------------------------------------------------------------------------
// Session lifecycle helpers
// ---------------------------------------------------------------------------

async function createSession(
  apiKey: string,
  projectId: string,
): Promise<BrowserbaseSession> {
  const res = await fetch(`${BROWSERBASE_API_URL}/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-BB-API-Key": apiKey,
    },
    body: JSON.stringify({ projectId, proxies: false }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Browserbase session creation failed (${res.status}): ${body}`,
    );
  }

  return res.json() as Promise<BrowserbaseSession>;
}

/** Best-effort session release — never throws. */
async function releaseSession(apiKey: string, sessionId: string): Promise<void> {
  await fetch(`${BROWSERBASE_API_URL}/sessions/${sessionId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-BB-API-Key": apiKey,
    },
    body: JSON.stringify({ status: "REQUEST_RELEASE" }),
  }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Content extraction (mirrors fetch-content.ts logic using cheerio)
// ---------------------------------------------------------------------------

function extractFromHtml(rawHtml: string): Pick<FetchedContent, "text" | "title" | "description"> {
  const $ = cheerio.load(rawHtml);

  // Strip noise — same ruleset as direct fetch
  $(
    [
      "script", "style", "noscript", "svg",
      "img", "picture", "video", "audio", "iframe",
      "nav", "footer", "header", "aside",
      "[role='navigation']", "[role='banner']", "[role='complementary']",
      "[aria-hidden='true']", ".cookie-banner", "#cookie-banner",
      ".ad", ".advertisement",
    ].join(", "),
  ).remove();

  const title =
    $("title").first().text().trim() ||
    $("h1").first().text().trim() ||
    null;

  const description =
    $("meta[name='description']").attr("content")?.trim() ||
    $("meta[property='og:description']").attr("content")?.trim() ||
    null;

  const contentEl = $(
    "main, article, [role='main'], .job-description, #job-description",
  ).first();

  const text = (contentEl.length > 0 ? contentEl : $("body"))
    .text()
    .replace(/\s+/g, " ")
    .trim();

  return { text, title, description };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch a URL using a Browserbase-managed browser session via Playwright CDP.
 * Used as the fallback when direct HTTP fetch returns insufficient content
 * (typically because the page requires JavaScript to render its content).
 *
 * Requires:
 *   BROWSERBASE_API_KEY    — Browserbase API key
 *   BROWSERBASE_PROJECT_ID — target project ID
 *
 * playwright-core is imported dynamically so it isn't bundled when the
 * fallback is not needed.
 */
export async function browserbaseFetch(url: string): Promise<BrowserFallbackResult> {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID;

  if (!apiKey || !projectId) {
    throw new Error(
      "BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID must be set to use the browser fallback.",
    );
  }

  const session = await createSession(apiKey, projectId);

  try {
    // Dynamic import — keeps playwright-core out of the main bundle path
    const { chromium } = await import("playwright-core");

    const browser = await chromium.connectOverCDP(session.connectUrl);

    try {
      // Reuse the default context/page that Browserbase creates
      const context =
        browser.contexts().at(0) ?? (await browser.newContext());
      const page =
        context.pages().at(0) ?? (await context.newPage());

      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: NAVIGATION_TIMEOUT_MS,
      });

      // Let lazy-loaded content settle
      await page.waitForTimeout(POST_LOAD_WAIT_MS);

      const rawHtml = await page.content();
      const { text, title, description } = extractFromHtml(rawHtml);

      return {
        rawHtml,
        text,
        title,
        description,
        isInsufficient: text.length < MIN_CONTENT_LENGTH,
        statusCode: 200,
        sessionId: session.id,
      };
    } finally {
      await browser.close().catch(() => undefined);
    }
  } finally {
    await releaseSession(apiKey, session.id);
  }
}
