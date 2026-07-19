import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { DashboardNav } from "@/components/dashboard-nav";
import { ThemeToggle } from "@/components/theme-toggle";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="dashboard-shell">
      {/* ── Dashboard header ──────────────────────────────────────── */}
      <header className="site-header">
        <div className="site-header-inner">
          <Link className="brand" href="/dashboard">
            Email GenAI
            <span className="brand-badge">Workspace</span>
          </Link>
          <nav className="header-nav header-nav--account">
            <OrganizationSwitcher
              afterCreateOrganizationUrl="/dashboard"
              afterLeaveOrganizationUrl="/dashboard"
              afterSelectOrganizationUrl="/dashboard"
              hidePersonal
            />
            <UserButton />
            <ThemeToggle />
          </nav>
        </div>
      </header>

      {/* ── Section navigation ─────────────────────────────────────── */}
      <DashboardNav />

      {/* ── Dashboard body ─────────────────────────────────────────── */}
      <div className="dashboard-body">
        {children}
      </div>
    </div>
  );
}
