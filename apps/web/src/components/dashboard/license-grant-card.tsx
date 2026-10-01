import type { MeLicenseGrant } from "@pupitre/shared/plans"
import { useMutation } from "@tanstack/react-query"
import { CreditCard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { Facts } from "@/components/ui/facts"
import { StatusBadge } from "@/components/ui/status-badge"
import { useTranslations } from "@/hooks/use-locale"
import { openBillingPortal } from "@/lib/api/queries"
import { leaveFor } from "@/lib/config/urls"
import { subscriptionStatusLook } from "@/lib/domain/billing"
import { formatDate } from "@/lib/utils/format"

export interface LicenseGrantCardProps {
  organizationId: string
  grant: MeLicenseGrant
  portal: boolean
}

export function LicenseGrantCard({
  organizationId,
  grant,
  portal,
}: LicenseGrantCardProps) {
  const t = useTranslations()
  const opening = useMutation({
    mutationFn: () => openBillingPortal(organizationId),
    onSuccess: leaveFor,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("license.grant.title")}</CardTitle>
        <StatusBadge look={subscriptionStatusLook(grant.status)} />
      </CardHeader>

      <Facts
        facts={[
          {
            label: t("license.grant.seats"),
            value: t.plural("billing.seat", grant.seats),
          },
          {
            label: t("license.grant.ends"),
            value: grant.current_period_end
              ? formatDate(grant.current_period_end, t)
              : t("license.grant.noEnd"),
          },
        ]}
      />

      {portal ? (
        <div className="flex flex-col gap-gutter border-line border-t px-4 py-3">
          <div>
            <Button
              icon={CreditCard}
              loading={opening.isPending}
              onClick={() => {
                opening.mutate()
              }}
              variant="primary"
            >
              {opening.isPending
                ? t("billing.portalOpening")
                : t("billing.portal")}
            </Button>
          </div>

          {opening.isError ? (
            <Callout
              fix={t("billing.portalFailedFix")}
              title={t("billing.portalFailed")}
              tone="danger"
            />
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}
