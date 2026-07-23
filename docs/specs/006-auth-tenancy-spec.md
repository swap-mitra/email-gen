# 006 Auth + Tenancy Spec

## Goal

Define how users authenticate and how workspace boundaries are enforced.

## Chosen default

- Clerk handles authentication, organizations, and organization switching

## Rules

- Application routes under the product surface are protected
- All workspace data access is constrained by active membership
- API handlers reject requests without valid membership context
- Workspace admins can manage workspace settings and knowledge items

## Acceptance

- Unauthenticated requests are redirected or rejected
- Cross-workspace access is denied
- Tenant context is available in UI and API code
