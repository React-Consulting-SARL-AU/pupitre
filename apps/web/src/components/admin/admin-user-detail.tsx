import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AdminEventsCard } from "@/components/admin/admin-events-card"
import { AdminFailure } from "@/components/admin/admin-failure"
import { AdminUserDanger } from "@/components/admin/admin-user-danger"
import { AdminUserDevices } from "@/components/admin/admin-user-devices"
import { AdminUserOverview } from "@/components/admin/admin-user-overview"
import { AdminUserServers } from "@/components/admin/admin-user-servers"
import { PageTabs } from "@/components/ui/page-tabs"
import { SkeletonCards } from "@/components/ui/skeleton"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { adminUserQueryOptions } from "@/lib/api/admin-queries"
import { queryKeys } from "@/lib/api/queries"
import { canActOnPlatform } from "@/lib/domain/admin"

export const ADMIN_USER_TABS = [
  "overview",
  "devices",
  "servers",
  "events",
  "danger",
] as const

export type AdminUserTab = (typeof ADMIN_USER_TABS)[number]

export interface AdminUserDetailProps {
  id: string
  tab: AdminUserTab
  onTabChange: (tab: AdminUserTab) => void
}

export function AdminUserDetail({
  id,
  tab,
  onTabChange,
}: AdminUserDetailProps) {
  const t = useTranslations()
  const queryClient = useQueryClient()
  const { platformRole } = useDashboardContext()
  const user = useQuery(adminUserQueryOptions(id))
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.user(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.allUsers }),
    ])
  }

  if (user.isPending) {
    return <SkeletonCards label={t("admin.reading")} />
  }

  if (user.isError) {
    return (
      <AdminFailure
        error={user.error}
        fetching={user.isFetching}
        onRetry={() => {
          user.refetch()
        }}
      />
    )
  }

  const detail = user.data
  const acts = canActOnPlatform(platformRole)
  const refusedTitle = acts ? undefined : t("admin.users.roleRequired")

  return (
    <PageTabs
      label={t("admin.users.tabs")}
      onValueChange={(next) => {
        onTabChange(next as AdminUserTab)
      }}
      tabs={[
        {
          value: "overview",
          label: t("admin.users.tab.overview"),
          panel: (
            <AdminUserOverview
              acts={acts}
              detail={detail}
              onGranted={refresh}
            />
          ),
        },
        {
          value: "devices",
          label: t("admin.users.tab.devices"),
          panel: (
            <AdminUserDevices
              acts={acts}
              detail={detail}
              refusedTitle={refusedTitle}
            />
          ),
        },
        {
          value: "servers",
          label: t("admin.users.tab.servers"),
          panel: <AdminUserServers servers={detail.assigned_servers} />,
        },
        {
          value: "events",
          label: t("admin.users.tab.events"),
          panel: <AdminEventsCard events={detail.events} />,
        },
        {
          value: "danger",
          label: t("admin.users.tab.danger"),
          panel: (
            <AdminUserDanger
              acts={acts}
              detail={detail}
              refusedTitle={refusedTitle}
            />
          ),
        },
      ]}
      value={tab}
    />
  )
}
