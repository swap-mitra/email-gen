import { headers } from "next/headers";
import Link from "next/link";
import { RequestAccessForm } from "@/components/request-access-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { auth } from "@/lib/auth";

const capabilities = [
  "Submit a job or company URL and extract a structured opportunity",
  "Ground every draft in your workspace's knowledge and proof points",
  "Route drafts through a reviewable approval workflow before sending",
  "Full audit trail — every action tied to source, knowledge, and reviewer",
];


export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user.id ?? null;

  return (
    /* Fills exactly one viewport height — see the .landing rules in
       globals.css, where every vertical step scales with vh so the whole page
       fits without scrolling. */
    <div className="landing">
      {/* ── Site header ─────────────────────────────────────────────── */}
      <header className="site-header">
        <div className="site-header-inner">
          <div className="brand">
            Groundwork
            <span className="brand-badge">Beta</span>
          </div>
          <nav className="header-nav">
            {userId ? (
              <Link href="/dashboard">Dashboard →</Link>
            ) : (
              <Link href="/sign-in">Sign in</Link>
            )}
            <ThemeToggle />
          </nav>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <main className="page-shell">
        <section className="landing-hero">
          <p className="hero-kicker">Do the groundwork before you say a word.</p>
          <h1 className="t-display hero-headline">
            Outreach from real signals, not <em>copy-paste</em> prompts.
          </h1>
          <p className="hero-body">
            Groundwork turns a company or hiring URL into a structured opportunity, grounds the
            message in your team&apos;s proof points, and routes every draft through a reviewable
            workspace workflow.
          </p>
          <div className="hero-actions">
            {userId ? (
              <Link className="btn btn-primary" href="/dashboard">
                Open dashboard
              </Link>
            ) : (
              <Link className="btn btn-primary" href="/sign-in">
                Sign in with Google
              </Link>
            )}
          </div>
        </section>

        {/* ── Two-column spec strip ────────────────────────────────── */}
        {/* Collapses to one column once signed in, when the right-hand
            request-access column has nothing to say. */}
        <div className={`spec-strip${userId ? " spec-strip--single" : ""}`}>
          <div className="spec-col">
            <p className="spec-col-label">What it does</p>
            <h2>The workflow</h2>
            <ul className="spec-list">
              {capabilities.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          {!userId && (
            <div className="spec-col">
              <p className="spec-col-label">No account yet?</p>
              <h2>Request access</h2>
              <p className="spec-body">
                Groundwork is invite-only while it&apos;s in beta. Leave your email and the admin
                will add you.
              </p>
              <RequestAccessForm />
            </div>
          )}
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="site-footer">
        <span>Do the groundwork before you say a word.</span>
        <span>
          Designed and developed by{" "}
          <a href="https://www.linkedin.com/in/swapnilmitra/" target="_blank" rel="noreferrer">
            Swapnil Mitra
          </a>
        </span>
      </footer>
    </div>
  );
}
