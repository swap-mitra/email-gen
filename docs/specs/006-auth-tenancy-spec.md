# 006 Auth + Tenancy Spec

## Goal

Define how users authenticate and how workspace boundaries are enforced.

## Chosen default

- [Better-Auth](https://www.better-auth.com), self-hosted, handles authentication — Google-only sign-in, no separate hosted identity domain to register
- Better-Auth's organization plugin owns organizations, membership, and roles; workspaces are a thin uuid-keyed mirror of that `organization` table (see [002 Domain Model](002-domain-model.md)) — membership/role is sourced live from Better-Auth's own `member` table, never mirrored locally
- The `gmail.compose` scope is requested up front at sign-in (same Google account either way), so Gmail export needs no separate delivery-specific auth step

## Rules

- Application routes under the product surface are protected
- All workspace data access is constrained by active Better-Auth membership
- API handlers reject requests without valid membership context; cross-workspace access is rejected at the API/query layer, not just in the UI
- `owner`/`admin` can manage workspace settings and knowledge items; `member` can create opportunities, generate drafts, revise, approve, and export

## Acceptance

- Unauthenticated requests are redirected or rejected
- Cross-workspace access is denied
- Tenant context (workspace id, role) is available in UI and API code
