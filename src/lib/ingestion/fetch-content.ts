import * as cheerio from "cheerio";
import { assertPublicHttpUrl } from "./url-safety";

const FETCH_TIMEOUT_MS = 15_000;
const MIN_CONTENT_LENGTH = 400; // chars — below this triggers browser fallback
const MAX_REDIRECTS = 5;

/**
 * Result of a content extraction attempt against a URL.
 */
export type FetchedContent = {
  rawHtml: string;
  text: string;
  title: string | null;
  description: string | null;
  /** True when extracted text is below MIN_CONTENT_LENGTH — JS-rendered page suspected. */
  isInsufficient: boolean;
  /** HTTP status code from the fetch. */
  statusCode: number;
};

/**
 * Strips noise elements and pulls readable text/title/description out of raw
 * HTML. Shared by the direct fetch path here and the Playwright-rendered
 * path in browser-fallback.ts — same markup, same extraction rules.
 */
export function extractReadableContent(
  rawHtml: string,
): Pick<FetchedContent, "text" | "title" | "description"> {
  const $ = cheerio.load(rawHtml);

  // ── Strip noise ────────────────────────────────────────────────────────
  $(
    [
      "script",
      "style",
      "noscript",
      "svg",
      "img",
      "picture",
      "video",
      "audio",
      "iframe",
      "nav",
      "footer",
      "header",
      "aside",
      "[role='navigation']",
      "[role='banner']",
      "[role='complementary']",
      "[aria-hidden='true']",
      ".cookie-banner",
      "#cookie-banner",
      ".ad",
      ".advertisement",
    ].join(", "),
  ).remove();

  // ── Extract metadata ────────────────────────────────────────────────────
  const title =
    $("title").first().text().trim() ||
    $("h1").first().text().trim() ||
    null;

  const description =
    $("meta[name='description']").attr("content")?.trim() ||
    $("meta[property='og:description']").attr("content")?.trim() ||
    null;

  // ── Extract body text ────────────────────────────────────────────────────
  // Prefer semantic landmarks; fall back to full body
  const contentEl =
    $("main, article, [role='main'], .job-description, #job-description").first();

  const text = (contentEl.length > 0 ? contentEl : $("body"))
    .text()
    .replace(/\s+/g, " ")
    .trim();

  return { text, title, description };
}

/**
 * Attempt to fetch a URL directly and extract its readable text content.
 *
 * Strategy:
 *  1. Fetch with a realistic User-Agent and timeout.
 *  2. Remove all noise elements (scripts, styles, nav, footer, ads).
 *  3. Prefer <main> / <article> / [role="main"] over bare <body>.
 *  4. Return isInsufficient=true when text is too short → triggers Playwright fallback.
 */
export async function fetchAndExtractContent(url: string): Promise<FetchedContent> {
  // Manual redirect handling: each hop is re-validated against
  // assertPublicHttpUrl so a public URL can't 302 into an internal address
  // (the most common real-world SSRF bypass).
  let currentUrl = url;
  let response: Response | undefined;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHttpUrl(currentUrl);

    response = await fetch(currentUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; EmailGenAI/1.0; +https://emailgenai.com/bot)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) break;
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    break;
  }

  if (!response) {
    throw new Error("Failed to fetch the source URL.");
  }

  const rawHtml = await response.text();
  const { text, title, description } = extractReadableContent(rawHtml);

  return {
    rawHtml,
    text,
    title,
    description,
    isInsufficient: text.length < MIN_CONTENT_LENGTH,
    statusCode: response.status,
  };
}

/**
 * Rule-based field extraction from fetched content.
 * Returns a best-effort normalized fields object.
 * Used as the fallback when AI extraction (@/lib/ai/extraction) is
 * unconfigured or fails — see ingest-opportunity.ts.
 */
export function extractNormalizedFields(
  content: FetchedContent,
  sourceUrl: string,
): Record<string, unknown> {
  const hostname = (() => {
    try {
      return new URL(sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  })();

  return {
    title: content.title,
    description: content.description,
    company: hostname,
    sourceUrl,
    extractedTextLength: content.text.length,
    extractedAt: new Date().toISOString(),
    // Truncated excerpt — full text stored separately as rawContent
    excerpt: content.text.slice(0, 800) || null,
    aiExtracted: false,
  };
}
