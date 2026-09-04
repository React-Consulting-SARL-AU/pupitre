import type { OrgRole } from "@pupitre/shared/permissions"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { LoadingState } from "@/components/ui/loading-state"
import { meQueryOptions } from "@/lib/api/queries"

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
})

function DashboardLayout() {
  const me = useQuery(meQueryOptions())

  if (me.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base">
        <LoadingState label="Ouverture de la console…" />
      </div>
    )
  }

  if (me.isError) {
    return <Navigate to="/auth/sign-in" />
  }

  return (
    <DashboardShell
      value={{
        user: me.data.user,
        organizations: me.data.organizations,
        activeOrganization: me.data.active_organization,
        role: me.data.role as OrgRole | null,
        entitlement: me.data.entitlement,
      }}
    >
      <Outlet />
    </DashboardShell>
  )
}
