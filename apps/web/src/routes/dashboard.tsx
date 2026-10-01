import type { OrgRole } from "@pupitre/shared/permissions"
import { useQuery } from "@tanstack/react-query"
import {
  createFileRoute,
  Navigate,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { LoadingState } from "@/components/ui/loading-state"
import { RouteError } from "@/components/ui/route-error"
import { useTranslations } from "@/hooks/use-locale"
import { isUnauthenticated } from "@/lib/api/errors"
import { meQueryOptions } from "@/lib/api/queries"
import { readSessionOrSignIn } from "@/lib/auth/session-gate"
import { consoleSection } from "@/lib/domain/chrome"
import { LICENSE_ROUTE, sendsToLicense } from "@/lib/domain/license-gate"

export const Route = createFileRoute("/dashboard")({
  // The console reads the session in the browser, so the gate does too.
  ssr: false,
  beforeLoad: async ({ context, location }) => {
    const me = await readSessionOrSignIn({ context, location })

    if (!me) {
      return
    }

    if (sendsToLicense({ license: me.license, pathname: location.pathname })) {
      throw redirect({ to: LICENSE_ROUTE })
    }
  },
  component: DashboardLayout,
})

function DashboardLayout() {
  const t = useTranslations()
  const me = useQuery(meQueryOptions())
  const { href, pathname } = useRouterState({
    select: (state) => state.location,
  })

  if (me.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center bg-base">
        <LoadingState label={t("nav.opening")} />
      </div>
    )
  }

  if (me.isError && isUnauthenticated(me.error)) {
    return <Navigate search={{ callbackURL: href }} to="/auth/sign-in" />
  }

  if (!me.data) {
    return (
      <div className="flex flex-1 items-center justify-center bg-base p-4">
        <RouteError
          error={me.error}
          reset={() => {
            me.refetch()
          }}
        />
      </div>
    )
  }

  return (
    <DashboardShell
      value={{
        user: me.data.user,
        organizations: me.data.organizations,
        activeOrganization: me.data.active_organization,
        role: me.data.role as OrgRole | null,
        license: me.data.license,
        platformRole: me.data.platform_role as OrgRole | null,
        platformCanAct: me.data.platform_can_act,
      }}
    >
      <div className="animate-enter" key={consoleSection(pathname)}>
        <Outlet />
      </div>
    </DashboardShell>
  )
}
