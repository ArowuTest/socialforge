import { useAuthStore } from "@/lib/stores/auth";
import { PlanType, Workspace } from "@/types";

const PLAN_ORDER: PlanType[] = [
  PlanType.FREE,
  PlanType.STARTER,
  PlanType.PRO,
  PlanType.AGENCY,
  PlanType.ENTERPRISE,
];

interface UseWorkspaceReturn {
  workspace: Workspace | null;
  workspaceId: string | null;
  isPlanAtLeast: (plan: PlanType) => boolean;
}

export function useWorkspace(): UseWorkspaceReturn {
  const workspace = useAuthStore((s) => s.workspace);

  const workspaceId = workspace?.id ?? null;

  const isPlanAtLeast = (plan: PlanType): boolean => {
    if (!workspace) return false;
    const currentIndex = PLAN_ORDER.indexOf(workspace.plan);
    const targetIndex = PLAN_ORDER.indexOf(plan);
    if (currentIndex === -1 || targetIndex === -1) return false;
    return currentIndex >= targetIndex;
  };

  return { workspace, workspaceId, isPlanAtLeast };
}
