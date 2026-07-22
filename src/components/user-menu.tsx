"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function UserMenu() {
  const router = useRouter();
  const { data: session } = authClient.useSession();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  if (!session) return null;

  return (
    <>
      <span className="user-menu-name">{session.user.name ?? session.user.email}</span>
      <button onClick={handleSignOut}>Sign out</button>
    </>
  );
}
