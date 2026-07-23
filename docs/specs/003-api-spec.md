# 003 API Spec

## Goal

Define the initial HTTP contract for the Next.js application.

## Base rules

- All product APIs live under `/api/v1`
- Every request is workspace-scoped after authentication
- Errors use a standard JSON envelope with `code`, `message`, `requestId`, and optional `details`
- Request and response shapes are validated with `zod`

## Initial endpoints

- `POST /api/v1/opportunities`
- `GET /api/v1/opportunities` — workspace list, newest first, `limit` param
- `GET /api/v1/opportunities/:id`
- `POST /api/v1/opportunities/:id/reingest`
- `POST /api/v1/drafts`
- `GET /api/v1/drafts` — workspace list with opportunity summary and latest version; `state`, `opportunityId`, `limit` params
- `GET /api/v1/drafts/:id` — includes `evidence`: the knowledge items behind the latest version's grounding refs
- `POST /api/v1/drafts/:id/revise`
- `POST /api/v1/drafts/:id/approve`
- `POST /api/v1/knowledge-items`
- `GET /api/v1/knowledge-items` — workspace list, newest first, `limit` param
- `GET /api/v1/activities`

## Acceptance

- Invalid inputs fail with typed API errors
- Response contracts are shared between handlers and UI consumers
