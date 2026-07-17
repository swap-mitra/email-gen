import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchAndExtractContent, extractNormalizedFields } from "@/lib/ingestion/fetch-content";
import { persistRawHtmlArtifact } from "@/lib/ingestion/persist-artifact";
import { browserbaseFetch } from "@/lib/ingestion/browser-fallback";

// ---------------------------------------------------------------------------
// fetch-content.ts unit tests
// ---------------------------------------------------------------------------

describe("P4 Ingestion — fetchAndExtractContent", () => {
  it("extracts text from a static HTML page", async () => {
    const html = `
      <html>
        <head>
          <title>Software Engineer at Acme</title>
          <meta name="description" content="Join our team as a Software Engineer." />
        </head>
        <body>
          <nav>Site navigation</nav>
          <main>
            <h1>Software Engineer</h1>
            <p>We are looking for a talented software engineer to join our distributed team.
            You will work on high-scale systems serving millions of users across the globe.
            Minimum 3 years of production engineering experience required. Our stack includes
            TypeScript, React, Next.js, PostgreSQL, and distributed cloud infrastructure on AWS.
            You will collaborate with product, design, and data teams to ship features weekly.
            Remote-friendly, competitive salary, equity, and comprehensive benefits package.
            We believe in autonomy, async-first communication, and continuous learning.</p>
          </main>
          <footer>Footer links here</footer>
          <script>alert("should be removed")</script>
        </body>
      </html>
    `;

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(html, { status: 200, headers: { "Content-Type": "text/html" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchAndExtractContent("https://example.com/jobs/engineer");

    expect(result.statusCode).toBe(200);
    expect(result.title).toBe("Software Engineer at Acme");
    expect(result.description).toBe("Join our team as a Software Engineer.");
    expect(result.text).toContain("Software Engineer");
    expect(result.text).not.toContain("Site navigation");
    expect(result.text).not.toContain("Footer");
    expect(result.text).not.toContain("should be removed");
    expect(result.isInsufficient).toBe(false);

    vi.unstubAllGlobals();
  });

  it("marks content as insufficient when page text is too short", async () => {
    const html = `<html><body><div id="root"></div></body></html>`;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(html, { status: 200, headers: { "Content-Type": "text/html" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchAndExtractContent("https://spa-app.com/jobs/1");
    expect(result.isInsufficient).toBe(true);
    expect(result.text.length).toBeLessThan(400);

    vi.unstubAllGlobals();
  });

  it("marks content as insufficient for a 200 HTML page with JS-only shell", async () => {
    const html = `<html><head><title>Loading...</title></head><body><div id="__next"></div></body></html>`;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(html, { status: 200, headers: { "Content-Type": "text/html" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchAndExtractContent("https://nextjs-spa.com/jobs/123");
    expect(result.isInsufficient).toBe(true);

    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// extractNormalizedFields unit tests
// ---------------------------------------------------------------------------

describe("P4 Ingestion — extractNormalizedFields", () => {
  it("extracts company hostname from source URL", () => {
    const fields = extractNormalizedFields(
      {
        rawHtml: "",
        text: "Engineer role description",
        title: "Software Engineer",
        description: null,
        isInsufficient: false,
        statusCode: 200,
      },
      "https://www.acmecorp.com/careers/engineer",
    );

    expect(fields.company).toBe("acmecorp.com");
    expect(fields.title).toBe("Software Engineer");
    expect(fields.aiExtracted).toBe(false);
  });

  it("includes excerpt truncated at 800 chars", () => {
    const longText = "a".repeat(1200);
    const fields = extractNormalizedFields(
      { rawHtml: "", text: longText, title: null, description: null, isInsufficient: false, statusCode: 200 },
      "https://example.com",
    );
    expect((fields.excerpt as string).length).toBe(800);
  });
});

// ---------------------------------------------------------------------------
// persistRawHtmlArtifact — skips gracefully when not configured
// ---------------------------------------------------------------------------

describe("P4 Ingestion — persistRawHtmlArtifact", () => {
  beforeEach(() => {
    // Ensure BLOB_READ_WRITE_TOKEN is not set in test env
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it("returns null when BLOB_READ_WRITE_TOKEN is not configured", async () => {
    const url = await persistRawHtmlArtifact("opp-123", "<html></html>", "direct");
    expect(url).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// browserbaseFetch — throws when credentials are absent
// ---------------------------------------------------------------------------

describe("P4 Ingestion — browserbaseFetch (no credentials)", () => {
  beforeEach(() => {
    delete process.env.BROWSERBASE_API_KEY;
    delete process.env.BROWSERBASE_PROJECT_ID;
  });

  it("throws a descriptive error when Browserbase credentials are missing", async () => {
    await expect(browserbaseFetch("https://example.com")).rejects.toThrow(
      "BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID must be set",
    );
  });
});
