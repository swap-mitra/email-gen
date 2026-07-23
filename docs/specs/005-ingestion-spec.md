# 005 Ingestion Spec

## Goal

Support reliable opportunity ingestion from modern career pages.

## Pipeline

1. Attempt direct fetch and HTML parsing
2. Extract readable content and metadata
3. If content is insufficient, trigger browser fallback
4. Persist raw artifacts and extraction logs
5. Emit a typed normalized opportunity payload

## Browser fallback

- Use Playwright through Browserbase for common JS-rendered pages
- Capture failure reason and retry metadata

## Acceptance

- Static pages work without a browser session
- JS-heavy pages can be ingested through fallback
- Failed ingestion is visible and retryable
