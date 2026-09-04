import { hasPermission, type Permission } from "@pupitre/shared/permissions"
import { useDashboardContext } from "@/hooks/use-dashboard-context"

export function usePermission(slug: Permission): boolean {
  const { role } = useDashboardContext()

  return role !== null && hasPermission(role, slug)
}
