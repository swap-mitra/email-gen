type MembershipCheckInput = {
  activeWorkspaceId: string;
  requestedWorkspaceId: string;
};

export function assertWorkspaceAccess({
  activeWorkspaceId,
  requestedWorkspaceId,
}: MembershipCheckInput) {
  if (activeWorkspaceId !== requestedWorkspaceId) {
    throw new Error("Cross-workspace access is forbidden.");
  }
}
