# 002 Domain Model

## Goal

Define the durable entities that support a multi-workspace outreach workflow product.

## Core entities

- `Organization`
- `Workspace`
- `Membership`
- `Opportunity`
- `KnowledgeItem`
- `Draft`
- `DraftVersion`
- `Approval`
- `Activity`
- `DeliveryAccount` and `SendJob` for future delivery support

## Workflow rules

- `Opportunity` owns the normalized source of truth for a lead/job
- `Draft` belongs to exactly one `Opportunity`
- `DraftVersion` is append-only
- `Approval` is explicit and reviewer-attributed
- `Activity` records user and system events across the workflow

## Tenancy

- Every durable business record carries `workspace_id`
- Cross-workspace queries are invalid by default
