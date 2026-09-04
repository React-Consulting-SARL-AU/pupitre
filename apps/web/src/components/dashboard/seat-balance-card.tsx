import { UsageBar } from "@/components/dashboard/usage-bar"
import { Callout } from "@/components/ui/callout"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import type { SeatBalance } from "@/lib/domain/billing"

export interface SeatBalanceCardProps {
  balance: SeatBalance
  paidSeats: boolean
}

function fillPercent({ paid, used }: SeatBalance): number | null {
  return paid === 0 ? null : (used / paid) * 100
}

export function SeatBalanceCard({ balance, paidSeats }: SeatBalanceCardProps) {
  const { paid, used, spare, verdict } = balance

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sièges et serveurs</CardTitle>
        <span className="font-data text-[12px] text-ink-2 tabular-nums">
          {used} / {paid}
        </span>
      </CardHeader>
      <CardBody className="flex flex-col gap-gutter">
        <UsageBar label="Occupés" percent={fillPercent(balance)} />

        <p className="text-[13px] text-ink-2">
          {used} {used > 1 ? "serveurs occupent" : "serveur occupe"} un siège
          sur les {paid}{" "}
          {paidSeats ? "sièges payés" : "sièges de développement"}.
        </p>

        {verdict === "unused" ? (
          <Callout
            fix={
              paidSeats
                ? "Réduisez la quantité dans le portail Stripe : vous payez des sièges que personne n'utilise."
                : "Vous pouvez enrôler encore des serveurs sans rien payer."
            }
            title={`${spare} ${spare > 1 ? "sièges sont inoccupés" : "siège est inoccupé"}.`}
            tone={paidSeats ? "danger" : "neutral"}
          />
        ) : null}

        {verdict === "over_quota" ? (
          <Callout
            fix="Ajoutez des sièges pour enrôler un serveur de plus."
            title="Tous les sièges sont occupés."
            tone="neutral"
          />
        ) : null}
      </CardBody>
    </Card>
  )
}
