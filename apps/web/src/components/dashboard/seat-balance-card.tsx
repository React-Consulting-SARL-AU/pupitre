import { UsageBar } from "@/components/dashboard/usage-bar"
import { Callout } from "@/components/ui/callout"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslations } from "@/hooks/use-locale"
import type { SeatBalance } from "@/lib/domain/billing"

export interface SeatBalanceCardProps {
  balance: SeatBalance
  paidSeats: boolean
}

function fillPercent({ paid, used }: SeatBalance): number | null {
  return paid === 0 ? null : (used / paid) * 100
}

export function SeatBalanceCard({ balance, paidSeats }: SeatBalanceCardProps) {
  const t = useTranslations()
  const { paid, used, spare, verdict } = balance

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("seats.title")}</CardTitle>
        <span className="font-data text-[12px] text-ink-2 tabular-nums">
          {used} / {paid}
        </span>
      </CardHeader>
      <CardBody className="flex flex-col gap-gutter">
        <UsageBar label={t("seats.filled")} percent={fillPercent(balance)} />

        <p className="text-[13px] text-ink-2">
          {t.plural("seats.summary", used, {
            used,
            paid,
            kind: paidSeats ? t("seats.kind.paid") : t("seats.kind.free"),
          })}
        </p>

        {verdict === "unused" ? (
          <Callout
            fix={paidSeats ? t("seats.spareFixPaid") : t("seats.spareFixFree")}
            title={t.plural("seats.spare", spare)}
            tone={paidSeats ? "danger" : "neutral"}
          />
        ) : null}

        {verdict === "over_quota" ? (
          <Callout
            fix={t("seats.fullFix")}
            title={t("seats.fullTitle")}
            tone="neutral"
          />
        ) : null}
      </CardBody>
    </Card>
  )
}
