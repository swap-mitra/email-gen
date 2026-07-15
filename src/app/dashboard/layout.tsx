import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import Link from "next/link";

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
          <nav className="header-nav" style={{ alignItems: "center", gap: 16 }}>
            <OrganizationSwitcher
              afterCreateOrganizationUrl="/dashboard"
              afterLeaveOrganizationUrl="/dashboard"
              afterSelectOrganizationUrl="/dashboard"
              hidePersonal
            />
            <UserButton />
          </nav>
        </div>
      </header>

      {/* ── Dashboard body ─────────────────────────────────────────── */}
      <div className="dashboard-body">
        {children}
      </div>
    </div>
  );
}
