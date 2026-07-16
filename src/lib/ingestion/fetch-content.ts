import * as cheerio from "cheerio";

const FETCH_TIMEOUT_MS = 15_000;
const MIN_CONTENT_LENGTH = 400; // chars — below this triggers browser fallback

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
 * Attempt to fetch a URL directly and extract its readable text content.
 *
 * Strategy:
 *  1. Fetch with a realistic User-Agent and timeout.
 *  2. Remove all noise elements (scripts, styles, nav, footer, ads).
 *  3. Prefer <main> / <article> / [role="main"] over bare <body>.
 *  4. Return isInsufficient=true when text is too short → triggers Playwright fallback.
 */
export async function fetchAndExtractContent(url: string): Promise<FetchedContent> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; EmailGenAI/1.0; +https://emailgenai.com/bot)",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  const rawHtml = await response.text();
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

  const rawText = (contentEl.length > 0 ? contentEl : $("body"))
    .text()
    .replace(/\s+/g, " ")
    .trim();

  return {
    rawHtml,
    text: rawText,
    title,
    description,
    isInsufficient: rawText.length < MIN_CONTENT_LENGTH,
    statusCode: response.status,
  };
}

/**
 * Rule-based field extraction from fetched content.
 * Returns a best-effort normalized fields object.
 * TODO(p5): replace with gpt-4o-mini schema-constrained extraction.
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
    aiExtracted: false, // will flip to true in P5
  };
}
