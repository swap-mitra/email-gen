# 001 Product Spec

## Goal

Modernize `email_gen` from a one-shot Streamlit demo into a SaaS-ready outreach workflow product.

## Scope

- Submit a job or company URL
- Extract and normalize opportunity details
- Retrieve relevant company knowledge
- Generate a grounded outbound draft
- Support human review and approval
- Prepare for future direct delivery integrations

## Non-scope

- Automatic sending in v1
- CRM replacement behavior
- Multi-channel outreach beyond email in v1

## Primary users

- Sales or business development operators
- Reviewers or managers approving outbound drafts
- Workspace admins managing brand voice and knowledge

## Success criteria

- A user can go from source URL to approved draft inside one workspace
- Every generated draft is traceable to source and knowledge evidence
- Core workflow state is durable and auditable
