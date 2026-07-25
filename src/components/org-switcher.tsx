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
    const { error } = await authClient.organization.setActive({ organizationId });
    setIsSwitching(false);
    if (error) {
      // The select re-derives its value from activeOrganization, which didn't
      // change — so it snaps back on its own. Navigating here would have shown
      // the old workspace's data as though the switch had worked.
      window.alert(error.message ?? "Could not switch workspace.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  // Wait for the active org too — rendering with value="" matches no <option>,
  // which paints the switcher blank.
  if (!organizations || organizations.length <= 1 || !activeOrganization) return null;

  return (
    <select
      className="org-switcher"
      value={activeOrganization.id}
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
