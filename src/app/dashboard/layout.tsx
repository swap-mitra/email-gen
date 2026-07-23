import Link from "next/link";
import { DashboardNav } from "@/components/dashboard-nav";
import { OrgSwitcher } from "@/components/org-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";

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
            Groundwork
            <span className="brand-badge">Workspace</span>
          </Link>
          <nav className="header-nav header-nav--account">
            <OrgSwitcher />
            <UserMenu />
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
