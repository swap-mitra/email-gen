"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function OrgSwitcher() {
  const router = useRouter();
  const { data: organizations } = authClient.useListOrganizations();
  const { data: activeOrganization } = authClient.useActiveOrganization();
  const [isSwitching, setIsSwitching] = useState(false);

  async function handleSwitch(organizationId: string) {
    if (!organizationId || organizationId === activeOrganization?.id) return;
    setIsSwitching(true);
    await authClient.organization.setActive({ organizationId });
    router.push("/dashboard");
    router.refresh();
    setIsSwitching(false);
  }

  if (!organizations || organizations.length <= 1) return null;

  return (
    <select
      className="org-switcher"
      value={activeOrganization?.id ?? ""}
      disabled={isSwitching}
      onChange={(e) => handleSwitch(e.target.value)}
    >
      {organizations.map((org) => (
        <option key={org.id} value={org.id}>
          {org.name}
        </option>
      ))}
    </select>
  );
}
