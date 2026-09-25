import { useQuery } from "@tanstack/react-query"
import { AdminAffiliateLinkDanger } from "@/components/admin/admin-affiliate-link-danger"
import { AdminAffiliateLinkOrganizations } from "@/components/admin/admin-affiliate-link-organizations"
import { AdminAffiliateLinkOverview } from "@/components/admin/admin-affiliate-link-overview"
import { AdminAffiliateLinkSettings } from "@/components/admin/admin-affiliate-link-settings"
import { AdminFailure } from "@/components/admin/admin-failure"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { PageTabs } from "@/components/ui/page-tabs"
import { SkeletonCards } from "@/components/ui/skeleton"
import { StatusDot } from "@/components/ui/status-dot"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { affiliateLinkQueryOptions } from "@/lib/api/admin-queries"
import {
  type AffiliateLinkTab,
  affiliateLinkTab,
  affiliateLinkTabFor,
} from "@/lib/domain/affiliate"

export interface AdminAffiliateLinkDetailProps {
  id: string
  tab: AffiliateLinkTab
  onTabChange: (tab: AffiliateLinkTab) => void
}

export function AdminAffiliateLinkDetail({
  id,
  tab,
  onTabChange,
}: AdminAffiliateLinkDetailProps) {
  const t = useTranslations()
  const { platformCanAct: acts } = useDashboardContext()
  const link = useQuery(affiliateLinkQueryOptions(id))

  if (link.isPending) {
    return <SkeletonCards label={t("admin.reading")} />
  }

  if (link.isError) {
    return (
      <AdminFailure
        error={link.error}
        fetching={link.isFetching}
        onRetry={() => {
          link.refetch()
        }}
      />
    )
  }

  const detail = link.data
  const state = detail.disabled
    ? t("admin.links.disabled")
    : t("admin.links.enabled")
  const current = affiliateLinkTabFor(tab, acts)

  return (
    <div className="flex flex-col gap-gutter">
      <Card>
        <CardHeader>
          <CardTitle>{detail.name}</CardTitle>
          <span className="inline-flex items-center gap-2 text-[13px] text-ink-2">
            <StatusDot
              label={state}
              shape={detail.disabled ? "hollow" : "filled"}
              tone={detail.disabled ? "muted" : "ok"}
            />
            {state}
          </span>
        </CardHeader>
      </Card>

      <PageTabs
        label={t("admin.links.tabsLabel")}
        onValueChange={(next) => {
          onTabChange(affiliateLinkTab(next))
        }}
        tabs={[
          {
            value: "overview",
            label: t("admin.links.tab.overview"),
            panel: <AdminAffiliateLinkOverview link={detail} />,
          },
          {
            value: "organizations",
            label: t("admin.links.tab.organizations"),
            panel: (
              <AdminAffiliateLinkOrganizations
                organizations={detail.organizations}
              />
            ),
          },
          ...(acts
            ? [
                {
                  value: "settings",
                  label: t("admin.links.tab.settings"),
                  panel: <AdminAffiliateLinkSettings link={detail} />,
                },
                {
                  value: "danger",
                  label: t("admin.links.tab.danger"),
                  panel: <AdminAffiliateLinkDanger link={detail} />,
                },
              ]
            : []),
        ]}
        value={current}
      />
    </div>
  )
}
