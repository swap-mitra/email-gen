# 002 Domain Model

## Goal

Define the durable entities that support a multi-workspace outreach workflow product.

## Core entities

- `Workspace` — a thin uuid-keyed mirror of Better-Auth's `organization` table; membership and role are sourced live from Better-Auth's own `member`/`organization` tables, not mirrored locally (see [006 Auth + Tenancy Spec](006-auth-tenancy-spec.md))
- `Opportunity`
- `KnowledgeItem`
- `Draft`
- `DraftVersion`
- `Approval`
- `Activity`
- `DeliveryAccount`, `SendJob`, `SendAttempt` for delivery (see [010 Delivery Spec](010-future-delivery-spec.md))

## Workflow rules

- `Opportunity` owns the normalized source of truth for a lead/job
- `Draft` belongs to exactly one `Opportunity`
- `DraftVersion` is append-only
- `Approval` is explicit and reviewer-attributed
- `Activity` records user and system events across the workflow
- `SendJob` records each export attempt independent of the draft's own state; `SendAttempt` records each underlying provider call for a `SendJob`

## Tenancy

- Every durable business record carries `workspaceId`
- Cross-workspace queries are invalid by default and rejected at the API layer
