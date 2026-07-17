const BLOB_PREFIX = "ingestion";

/**
 * Persist raw HTML from an ingestion run to Vercel Blob storage.
 * Returns the blob URL on success, or null if:
 *   - BLOB_READ_WRITE_TOKEN is not set (Blob not configured)
 *   - The upload fails for any reason (non-fatal — ingestion continues)
 *
 * Stored at: ingestion/<opportunityId>/raw.html
 */
export async function persistRawHtmlArtifact(
  opportunityId: string,
  rawHtml: string,
  source: "direct" | "browser",
): Promise<string | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;

  try {
    // Dynamic import — keeps @vercel/blob out of the critical path
    const { put } = await import("@vercel/blob");

    const blob = await put(
      `${BLOB_PREFIX}/${opportunityId}/raw-${source}.html`,
      rawHtml,
      {
        access: "private",
        contentType: "text/html; charset=utf-8",
        token: process.env.BLOB_READ_WRITE_TOKEN,
        // Overwrite if a previous ingest already stored one
        addRandomSuffix: false,
      },
    );

    return blob.url;
  } catch (err) {
    // Non-fatal — log to console but do NOT throw or fail the ingestion step
    console.warn(
      `[persist-artifact] Failed to upload raw HTML for opportunity ${opportunityId}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
