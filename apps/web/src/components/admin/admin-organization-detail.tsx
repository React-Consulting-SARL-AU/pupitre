import { useQuery } from "@tanstack/react-query"
import { AdminEventsCard } from "@/components/admin/admin-events-card"
import { AdminFailure } from "@/components/admin/admin-failure"
import { AdminOrganizationDanger } from "@/components/admin/admin-organization-danger"
import { AdminOrganizationMembers } from "@/components/admin/admin-organization-members"
import { AdminOrganizationOverview } from "@/components/admin/admin-organization-overview"
import { AdminOrganizationServers } from "@/components/admin/admin-organization-servers"
import { AdminOrganizationSettings } from "@/components/admin/admin-organization-settings"
import { AdminOrganizationSubscriptions } from "@/components/admin/admin-organization-subscriptions"
import { PageTabs } from "@/components/ui/page-tabs"
import { SkeletonCards } from "@/components/ui/skeleton"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { adminOrganizationQueryOptions } from "@/lib/api/admin-queries"
import { canActOnPlatform } from "@/lib/domain/admin"

export const ADMIN_ORGANIZATION_TABS = [
  "overview",
  "members",
  "servers",
  "subscriptions",
  "events",
  "settings",
  "danger",
] as const

export type AdminOrganizationTab = (typeof ADMIN_ORGANIZATION_TABS)[number]

export interface AdminOrganizationDetailProps {
  id: string
  tab: AdminOrganizationTab
  onTabChange: (tab: AdminOrganizationTab) => void
}

export function AdminOrganizationDetail({
  id,
  tab,
  onTabChange,
}: AdminOrganizationDetailProps) {
  const t = useTranslations()
  const { platformRole } = useDashboardContext()
  const organization = useQuery(adminOrganizationQueryOptions(id))

  if (organization.isPending) {
    return <SkeletonCards label={t("admin.reading")} />
  }

  if (organization.isError) {
    return (
      <AdminFailure
        error={organization.error}
        fetching={organization.isFetching}
        onRetry={() => {
          organization.refetch()
        }}
      />
    )
  }

  const detail = organization.data
  const acts = canActOnPlatform(platformRole)
  const refusedTitle = acts ? undefined : t("admin.organizations.roleRequired")

  return (
    <PageTabs
      label={t("admin.organizations.tabs")}
      onValueChange={(next) => {
        onTabChange(next as AdminOrganizationTab)
      }}
      tabs={[
        {
          value: "overview",
          label: t("admin.organizations.tab.overview"),
          panel: <AdminOrganizationOverview detail={detail} />,
        },
        {
          value: "members",
          label: t("admin.organizations.tab.members"),
          panel: <AdminOrganizationMembers acts={acts} detail={detail} />,
        },
        {
          value: "servers",
          label: t("admin.organizations.tab.servers"),
          panel: <AdminOrganizationServers servers={detail.servers} />,
        },
        {
          value: "subscriptions",
          label: t("admin.organizations.tab.subscriptions"),
          panel: <AdminOrganizationSubscriptions acts={acts} detail={detail} />,
        },
        {
          value: "events",
          label: t("admin.organizations.tab.events"),
          panel: <AdminEventsCard events={detail.events} />,
        },
        {
          value: "settings",
          label: t("admin.organizations.tab.settings"),
          panel: (
            <AdminOrganizationSettings
              acts={acts}
              detail={detail}
              refusedTitle={refusedTitle}
            />
          ),
        },
        {
          value: "danger",
          label: t("admin.organizations.tab.danger"),
          panel: (
            <AdminOrganizationDanger
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
