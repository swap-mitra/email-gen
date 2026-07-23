# 007 UI Spec

## Goal

Describe the product surfaces that will be implemented on top of the workflow API.

## Implemented pages

- Dashboard (`/dashboard`) — workspace identity, a compact create-opportunity form that hands off to the opportunity detail page, stat tiles (opportunities, ingesting now, awaiting approval, approved) linking out to the relevant list page, and a capped "needs attention" list surfacing failed ingestion/generation
- Opportunities list (`/dashboard/opportunities`) — all opportunities with ingest status, auto-refreshing while ingestion runs
- Opportunity detail (`/dashboard/opportunities/:id`) — extraction status, normalized fields, extraction metadata, ingest log, drafts, retry/re-ingest, generate, and delete actions
- Draft editor (`/dashboard/drafts/:id`) — editable subject/body (revise), evidence panel showing the knowledge items cited by the generated version, approval with optional reviewer note, copy to clipboard
- Approval queue (`/dashboard/approvals`) — drafts with completed generation awaiting approval, quick approve or open-for-review
- Knowledge hub (`/dashboard/knowledge`) — add and list knowledge items with embedding status
- Workspace settings (`/dashboard/settings`) — workspace record facts plus Clerk organization profile for members and roles

Persistent section navigation is rendered under the dashboard header.

## Interaction rules

- Each workflow state lives on exactly one page — the dashboard routes to the opportunity/draft/approval pages rather than duplicating their state inline
- The opportunity detail page shows extraction status, normalized fields, and ingest logs
- The draft editor shows evidence used for generation alongside editable content
- Approval actions are explicit and attributable to a reviewer; an optional note can be attached
- Failed ingestion and generation are retryable from the UI (per spec 008)
- Pages whose entity has a workflow still running refresh automatically until it settles

## Acceptance

- Every core workflow state has a visible UI representation
- User-facing errors are actionable and specific
