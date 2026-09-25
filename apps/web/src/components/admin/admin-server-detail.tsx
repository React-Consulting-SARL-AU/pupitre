import { useQuery } from "@tanstack/react-query"
import { AdminEventsCard } from "@/components/admin/admin-events-card"
import { AdminFailure } from "@/components/admin/admin-failure"
import { AdminServerAlerts } from "@/components/admin/admin-server-alerts"
import { AdminServerDanger } from "@/components/admin/admin-server-danger"
import { AdminServerDevices } from "@/components/admin/admin-server-devices"
import { AdminServerOverview } from "@/components/admin/admin-server-overview"
import { AdminServerUsage } from "@/components/admin/admin-server-usage"
import { PageTabs } from "@/components/ui/page-tabs"
import { SkeletonCards } from "@/components/ui/skeleton"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { adminServerQueryOptions } from "@/lib/api/admin-queries"
import { canActOnPlatform } from "@/lib/domain/admin"

export const ADMIN_SERVER_TABS = [
  "overview",
  "usage",
  "alerts",
  "devices",
  "log",
  "danger",
] as const

export type AdminServerTab = (typeof ADMIN_SERVER_TABS)[number]

export const ADMIN_SERVER_TAB: AdminServerTab = "overview"

export function adminServerTab(value: unknown): AdminServerTab {
  return ADMIN_SERVER_TABS.find((tab) => tab === value) ?? ADMIN_SERVER_TAB
}

export interface AdminServerDetailProps {
  id: string
  tab: AdminServerTab
  onTabChange: (tab: AdminServerTab) => void
}

export function AdminServerDetail({
  id,
  tab,
  onTabChange,
}: AdminServerDetailProps) {
  const t = useTranslations()
  const { platformRole } = useDashboardContext()
  const server = useQuery(adminServerQueryOptions(id))

  if (server.isPending) {
    return <SkeletonCards label={t("admin.reading")} />
  }

  if (server.isError) {
    return (
      <AdminFailure
        error={server.error}
        fetching={server.isFetching}
        onRetry={() => {
          server.refetch()
        }}
      />
    )
  }

  const detail = server.data
  const acts = canActOnPlatform(platformRole)

  return (
    <PageTabs
      label={t("admin.servers.tabs")}
      onValueChange={(next) => {
        onTabChange(adminServerTab(next))
      }}
      tabs={[
        {
          value: "overview",
          label: t("admin.servers.tab.overview"),
          panel: <AdminServerOverview canAct={acts} server={detail} />,
        },
        {
          value: "usage",
          label: t("admin.servers.tab.usage"),
          panel: <AdminServerUsage server={detail} />,
        },
        {
          value: "alerts",
          label: t("admin.servers.tab.alerts"),
          panel: <AdminServerAlerts canAct={acts} server={detail} />,
        },
        {
          value: "devices",
          label: t("admin.servers.tab.devices"),
          panel: <AdminServerDevices server={detail} />,
        },
        {
          value: "log",
          label: t("admin.servers.tab.log"),
          panel: <AdminEventsCard events={detail.events} />,
        },
        ...(acts
          ? [
              {
                value: "danger",
                label: t("admin.servers.tab.danger"),
                panel: <AdminServerDanger server={detail} />,
              },
            ]
          : []),
      ]}
      value={tab}
    />
  )
}
