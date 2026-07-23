# 008 Async Workflow Spec

## Goal

Define the retryable background jobs that keep long-running product actions off the request path.

## Chosen default

- Inngest orchestrates ingestion, extraction, retrieval, and draft generation workflows

## Rules

- Every workflow has an idempotency key
- Retries are bounded and observable
- User-visible state changes are recorded in `Activity`
- Long-running work should not depend on a single HTTP request staying open

## Acceptance

- Ingest and generation work can be replayed safely
- Failed workflows surface retryable status to the UI
