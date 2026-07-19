"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Overview", exact: true },
  { href: "/dashboard/opportunities", label: "Opportunities", exact: false },
  { href: "/dashboard/approvals", label: "Approvals", exact: false },
  { href: "/dashboard/knowledge", label: "Knowledge", exact: false },
  { href: "/dashboard/settings", label: "Settings", exact: false },
] as const;

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="dash-nav" aria-label="Workspace sections">
      <div className="dash-nav-inner">
        {LINKS.map(({ href, label, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={active ? "dash-nav-link dash-nav-link-active" : "dash-nav-link"}
              aria-current={active ? "page" : undefined}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
