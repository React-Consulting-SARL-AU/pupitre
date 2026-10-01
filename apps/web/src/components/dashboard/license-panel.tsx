import { useQuery } from "@tanstack/react-query"
import { Lock, RotateCw } from "lucide-react"
import { LicenseGrantCard } from "@/components/dashboard/license-grant-card"
import { LicenseServersCard } from "@/components/dashboard/license-servers-card"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonCards } from "@/components/ui/skeleton"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { usePermission } from "@/hooks/use-permission"
import {
  meQueryOptions,
  statusQueryOptions,
  subscriptionQueryOptions,
} from "@/lib/api/queries"
import { opensBillingPortal } from "@/lib/domain/billing"

export function LicensePanel() {
  const t = useTranslations()
  const { activeOrganization } = useDashboardContext()
  const canManage = usePermission("billing:manage")
  const organizationId = activeOrganization?.id ?? ""
  const me = useQuery(meQueryOptions())
  const status = useQuery(statusQueryOptions())
  const grant = me.data?.license_grant ?? null
  const stripe = status.data?.billing.mode === "stripe"
  const subscription = useQuery({
    ...subscriptionQueryOptions(organizationId),
    enabled: canManage && organizationId !== "" && grant !== null && stripe,
  })

  if (!canManage) {
    return (
      <EmptyState
        description={t("licensePanel.lockedDescription")}
        icon={Lock}
        title={t("licensePanel.lockedTitle")}
      />
    )
  }

  if (!activeOrganization) {
    return (
      <EmptyState
        description={t("licensePanel.noOrganizationDescription")}
        icon={Lock}
        title={t("licensePanel.noOrganizationTitle")}
      />
    )
  }

  if (me.isPending) {
    return <SkeletonCards label={t("licensePanel.reading")} />
  }

  if (!me.data?.servers) {
    return (
      <Callout
        action={
          <Button
            icon={RotateCw}
            loading={me.isFetching}
            onClick={() => {
              me.refetch()
            }}
            size="sm"
          >
            {t("common.retry")}
          </Button>
        }
        fix={t("licensePanel.failedFix")}
        title={t("licensePanel.failed")}
        tone="danger"
      />
    )
  }

  return (
    <div className="flex flex-col gap-section">
      <LicenseServersCard servers={me.data.servers} />

      {grant ? (
        <LicenseGrantCard
          grant={grant}
          organizationId={activeOrganization.id}
          portal={opensBillingPortal(
            subscription.data,
            status.data?.billing.mode
          )}
        />
      ) : null}
    </div>
  )
}
