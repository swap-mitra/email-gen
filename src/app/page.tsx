import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

const platformHighlights = [
  "Workspace-scoped opportunity and draft workflows",
  "Structured extraction from company and job URLs",
  "Grounded generation with knowledge-backed evidence",
  "Approval-first delivery pipeline ready for future Gmail MCP integration",
];

const foundationItems = [
  "Clerk-backed authentication and organization context",
  "Postgres tenancy schema with Drizzle migrations",
  "Protected dashboard shell and workspace bootstrap flow",
  "Typed API contracts for authenticated workspace context",
];

export default async function Home() {
  const { userId } = await auth();

  return (
    <main className="page-shell">
      <section className="hero hero-surface">
        <span className="eyebrow">Outbound workflow platform</span>
        <h1>Generate sharper outreach from real opportunities, not copy-paste prompts.</h1>
        <p>
          email_gen turns a company or hiring URL into a structured opportunity, grounds the
          message in your team&apos;s proof points, and routes every draft through a reviewable
          workspace workflow.
        </p>

        <div className="hero-actions">
          {userId ? (
            <Link className="button button-primary" href="/dashboard">
              Open dashboard
            </Link>
          ) : (
            <>
            <Link className="button button-primary" href="/sign-up">
              Create workspace
            </Link>
            <Link className="button button-secondary" href="/sign-in">
              Sign in
            </Link>
            </>
          )}
        </div>

        <div className="hero-grid">
          <article className="panel">
            <h2>What the product does</h2>
            <ul className="stack-list">
              {platformHighlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
          <article className="panel">
            <h2>Current foundation</h2>
            <ul className="stack-list">
              {foundationItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>
    </main>
  );
}
