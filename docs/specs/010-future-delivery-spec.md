# 010 Delivery Spec

## Goal

Deliver approved drafts into the reviewer's own Gmail drafts folder — never sent directly — behind a delivery-provider interface that keeps other providers pluggable.

## Entities

- `DeliveryAccount` — the reviewer's linked Google account, tokens resolved through Better-Auth
- `SendJob` — one export attempt for a draft version; `pending` → `running` → `completed` | `failed`, independent of the draft's own state
- `SendAttempt` — append-only log of each individual provider call underneath a `SendJob`

## Chosen default: direct Gmail API, not Gmail MCP

Delivery is implemented as a direct Gmail API integration (`gmail_draft` provider, [`src/lib/delivery/providers/gmail-draft.ts`](../../src/lib/delivery/providers/gmail-draft.ts)) rather than against Google's official Gmail MCP server, because that MCP server is still Developer-Preview-gated and not viable to depend on for a shipped feature. `manual_export` ([`src/lib/delivery/providers/manual-export.ts`](../../src/lib/delivery/providers/manual-export.ts)) remains the always-available fallback provider. If/when the Gmail MCP server reaches general availability, it can be added as another `DeliveryProvider` implementation without reworking `Draft`, `Approval`, `SendJob`, or `SendAttempt`.

## Rules

- Only drafts with `state === "approved_for_send"` can create send jobs; the API rejects export with a 409 otherwise, not just a hidden button
- Delivery providers are abstracted behind a common `DeliveryProvider` interface ([`src/lib/delivery/provider.ts`](../../src/lib/delivery/provider.ts))
- OAuth tokens for `gmail_draft` are resolved through Better-Auth (see [006 Auth + Tenancy Spec](006-auth-tenancy-spec.md)), not a separate delivery-specific auth flow
- Gmail export writes to the reviewer's Gmail *drafts*, never sends — final send stays a separate, manual, human action in Gmail itself
- The export button ships disabled with a tooltip until `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are configured (see README's Authentication section)

## Acceptance

- `gmail_draft` and `manual_export` both implement the same `DeliveryProvider` interface
- A future provider (e.g. Gmail MCP, once GA) can be added without reworking draft or approval behavior
