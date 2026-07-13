import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import Link from "next/link";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <Link className="brand-link" href="/dashboard">
            email_gen
          </Link>
          <p className="header-caption">Workspace-scoped outreach operations</p>
        </div>
        <div className="header-actions">
          <OrganizationSwitcher
            afterCreateOrganizationUrl="/dashboard"
            afterLeaveOrganizationUrl="/dashboard"
            afterSelectOrganizationUrl="/dashboard"
            hidePersonal
          />
          <UserButton />
        </div>
      </header>
      <main className="dashboard-main">{children}</main>
    </div>
  );
}
