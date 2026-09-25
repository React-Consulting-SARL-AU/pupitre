import { useQueryClient } from "@tanstack/react-query"
import { Lock } from "lucide-react"
import { useEffect, useRef } from "react"
import { StartChecklist } from "@/components/dashboard/start-checklist"
import { Callout } from "@/components/ui/callout"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { usePermission } from "@/hooks/use-permission"
import { useRequestCycle } from "@/hooks/use-request-cycle"
import { pollSubscription, queryKeys } from "@/lib/api/queries"

export interface StartPanelProps {
  returningFromCheckout?: boolean
}

export function StartPanel({ returningFromCheckout = false }: StartPanelProps) {
  const t = useTranslations()
  const { activeOrganization } = useDashboardContext()
  const canManage = usePermission("billing:manage")
  const organizationId = activeOrganization?.id ?? ""
  const queryClient = useQueryClient()
  const confirmation = useRequestCycle()
  const asked = useRef(false)
  const waiting = returningFromCheckout && canManage && organizationId !== ""
  const { run } = confirmation

  useEffect(() => {
    if (!waiting || asked.current) {
      return
    }

    asked.current = true

    run(async () => {
      const subscription = await pollSubscription(organizationId)

      queryClient.setQueryData(
        queryKeys.subscription(organizationId),
        subscription
      )
      await queryClient.invalidateQueries({ queryKey: queryKeys.me })
    })
  }, [waiting, organizationId, queryClient, run])

  if (!activeOrganization) {
    return (
      <EmptyState
        description={t("billingPanel.noOrganizationDescription")}
        icon={Lock}
        title={t("billingPanel.noOrganizationTitle")}
      />
    )
  }

  if (waiting && confirmation.phase !== "failed") {
    if (confirmation.phase !== "done") {
      return (
        <Card>
          <CardHeader>
            <CardTitle>{t("start.waitingTitle")}</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-[13px] text-ink-2">{t("start.waitingLead")}</p>
          </CardBody>
        </Card>
      )
    }

    return (
      <div className="flex flex-col gap-section">
        <Callout
          fix={t("start.confirmedLead")}
          title={t("start.confirmedTitle")}
        />
        <StartChecklist />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-section">
      {waiting ? (
        <Callout
          fix={t("start.pendingFailedFix")}
          title={t("start.pendingFailed")}
          tone="danger"
        />
      ) : null}

      <PageHeader
        mark={
          <span
            aria-hidden="true"
            className="flex size-11 items-center justify-center rounded-md bg-inverse font-data text-[16px] text-inverse-ink"
          >
            &gt;_
          </span>
        }
        title={t("start.heroTitle")}
      />

      <StartChecklist />
    </div>
  )
}
