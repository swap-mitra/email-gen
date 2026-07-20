# email_gen

`email_gen` is a spec-driven outreach workflow application built with Next.js and TypeScript.

The product is designed for teams that turn company or job URLs into grounded outbound email drafts, review them with evidence, and prepare them for future MCP-based delivery workflows.

## Core stack

- Next.js 15
- React 19
- TypeScript
- Clerk for authentication and organizations
- PostgreSQL + pgvector
- Drizzle ORM
- Zod
- Inngest for background workflows

## Current product foundation

The repository currently includes:

- public landing page
- Clerk-backed auth routes
- protected dashboard shell
- workspace resolution based on the active Clerk organization
- initial Drizzle schema and first migration
- workspace activity log foundation
- typed API contracts and workspace context endpoint

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create local environment variables:

```bash
copy .env.example .env.local
```

3. Apply the database schema against your Postgres database (Neon recommended — any Postgres 15+ with the `pgvector` extension works; see the `DATABASE_URL` comment in `.env.example`):

```bash
npm run db:generate
npm run db:push
```

4. Start the development server, and in a separate terminal, the Inngest dev server (required for background workflows — set `INNGEST_DEV=1` in `.env` first, see the comment above `INNGEST_DEV` in `.env.example`):

```bash
npm run dev
```

```bash
npm run inngest
```

## Required environment variables

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
DATABASE_URL=postgresql://user:password@host-pooler.region.aws.neon.tech/dbname?sslmode=require
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_SIGN_IN_URL=/sign-in
CLERK_SIGN_UP_URL=/sign-up
OPENROUTER_API_KEY=
OPENROUTER_EXTRACTION_MODEL=
OPENROUTER_GENERATION_MODEL=
OPENROUTER_EMBEDDING_MODEL=
BROWSERBASE_API_KEY=
BROWSERBASE_PROJECT_ID=
BLOB_READ_WRITE_TOKEN=
INNGEST_DEV=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
```

## Quality checks

Run these after changes:

```bash
npm run lint
npm run typecheck
npm run test
cmd /c rmdir /s /q .next
npm run build
```

## Specs

The implementation roadmap lives in `docs/specs/`.

- `001-product-spec.md`
- `002-domain-model.md`
- `003-api-spec.md`
- `004-ai-retrieval-spec.md`
- `005-ingestion-spec.md`
- `006-auth-tenancy-spec.md`
- `007-ui-spec.md`
- `008-async-workflow-spec.md`
- `009-observability-spec.md`
- `010-future-delivery-spec.md`
