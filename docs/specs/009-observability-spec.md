# 009 Observability Spec

## Goal

Provide enough visibility to debug product failures and audit user/system actions.

## Required signals

- Structured application logs — `src/lib/logger.ts`, JSON lines to stdout/stderr with `.child()` bindings for correlation fields; consumable by any log aggregator without an extra shipping step
- Request identifiers — every API error response includes `requestId` (`src/lib/api.ts`), and 5xx errors are logged server-side keyed by that same id
- Background job identifiers — each Inngest run is logged with its `runId` (start/completion/failure) across ingest, generate, and embed workflows
- Audit events for ingest, generate, revise, approve, and future send actions — `activities` table via `recordActivity`, unchanged
- Error monitoring for API and workflow failures — 5xx API errors and exhausted-retry workflow failures are logged at `error` level with the underlying error's name/message/stack

## Acceptance

- Every API error includes a request identifier — done
- Every major workflow action creates an activity record — done
- Operators can trace a failed draft back to source ingestion and AI steps — activity records give the audit trail; structured logs (workspaceId/opportunityId/draftId/runId bindings) give the technical detail (stack traces, degraded-mode warnings for AI extraction/browser fallback skips) needed to debug a specific failure

## Not implemented

- No external error-monitoring SaaS (e.g. Sentry) is wired up — no account/DSN exists yet. Structured error logs are designed to be forwarded to one later without changing call sites.
