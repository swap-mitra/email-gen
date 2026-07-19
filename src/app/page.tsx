import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

const capabilities = [
  "Submit a job or company URL and extract a structured opportunity",
  "Ground every draft in your workspace's knowledge and proof points",
  "Route drafts through a reviewable approval workflow before sending",
  "Full audit trail — every action tied to source, knowledge, and reviewer",
];


export default async function Home() {
  const { userId } = await auth();

  return (
    <>
      {/* ── Site header ─────────────────────────────────────────────── */}
      <header className="site-header">
        <div className="site-header-inner">
          <div className="brand">
            Email GenAI
            <span className="brand-badge">Beta</span>
          </div>
          <nav className="header-nav">
            {userId ? (
              <Link href="/dashboard">Dashboard →</Link>
            ) : (
              <>
                <Link href="/sign-in">Sign in</Link>
                <Link href="/sign-up">Create workspace</Link>
              </>
            )}
            <ThemeToggle />
          </nav>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <main className="page-shell">
        <section className="landing-hero">
          <p className="hero-kicker">Outbound workflow platform</p>
          <h1 className="t-display hero-headline">
            Outreach from real signals, not <em>copy-paste</em> prompts.
          </h1>
          <p className="hero-body">
            Email GenAI turns a company or hiring URL into a structured opportunity, grounds the
            message in your team&apos;s proof points, and routes every draft through a reviewable
            workspace workflow.
          </p>
          <div className="hero-actions">
            {userId ? (
              <Link className="btn btn-primary" href="/dashboard">
                Open dashboard
              </Link>
            ) : (
              <>
                <Link className="btn btn-primary" href="/sign-up">
                  Create workspace
                </Link>
                <Link className="btn btn-secondary" href="/sign-in">
                  Sign in
                </Link>
              </>
            )}
          </div>
        </section>

        {/* ── Two-column spec strip ────────────────────────────────── */}
        <div className="spec-strip spec-strip--single">
          <div className="spec-col">
            <p className="spec-col-label">What it does</p>
            <h2>The workflow</h2>
            <ul className="spec-list">
              {capabilities.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </main>
    </>
  );
}
