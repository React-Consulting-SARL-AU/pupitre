import { TRIAL_DAYS } from "@pupitre/shared/plans"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Download, Lock } from "lucide-react"
import { useEffect, useRef } from "react"
import { CheckoutForm } from "@/components/dashboard/checkout-form"
import { buttonClassName } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { usePermission } from "@/hooks/use-permission"
import { useRequestCycle } from "@/hooks/use-request-cycle"
import {
  membersQueryOptions,
  pollSubscription,
  queryKeys,
} from "@/lib/api/queries"

interface OrganizationMember {
  email: string
  role: string
}

export interface StartPanelProps {
  returningFromCheckout?: boolean
}

function ownerEmailOf(
  members: OrganizationMember[] | undefined
): string | null {
  return members?.find((member) => member.role === "owner")?.email ?? null
}

export function StartPanel({ returningFromCheckout = false }: StartPanelProps) {
  const t = useTranslations()
  const { activeOrganization } = useDashboardContext()
  const canManage = usePermission("billing:manage")
  const organizationId = activeOrganization?.id ?? ""
  const queryClient = useQueryClient()
  const confirmation = useRequestCycle()
  const asked = useRef(false)
  const members = useQuery({
    ...membersQueryOptions(organizationId),
    enabled: !canManage && organizationId !== "",
  })
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

  if (!canManage) {
    if (members.isPending) {
      return <LoadingState label={t("start.reading")} />
    }

    const owner = ownerEmailOf(members.data?.members)

    return (
      <EmptyState
        description={
          owner
            ? t("start.lockedDescription", { owner, days: TRIAL_DAYS })
            : t("start.lockedUnknownOwner", { days: TRIAL_DAYS })
        }
        icon={Lock}
        title={t("start.lockedTitle")}
      />
    )
  }

  if (waiting && confirmation.phase !== "failed") {
    return confirmation.phase === "done" ? (
      <Card>
        <CardHeader>
          <CardTitle>{t("start.confirmedTitle")}</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-gutter">
          <p className="text-[13px] text-ink-2">{t("start.confirmedLead")}</p>
          <div>
            {/* A full load, so the whole console reads the entitlement Stripe just opened. */}
            <a
              className={buttonClassName({ variant: "primary" })}
              href="/download"
            >
              <Download className="size-4" strokeWidth={1.5} />
              {t("start.confirmedAction")}
            </a>
          </div>
        </CardBody>
      </Card>
    ) : (
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
      {waiting ? (
        <Callout
          fix={t("start.pendingFailedFix")}
          title={t("start.pendingFailed")}
          tone="danger"
        />
      ) : null}

      <CheckoutForm
        defaultQuantity={1}
        organizationId={activeOrganization.id}
        variant="trial"
      />
    </div>
  )
}
