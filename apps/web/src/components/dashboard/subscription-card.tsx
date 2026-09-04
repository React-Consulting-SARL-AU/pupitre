import { useMutation } from "@tanstack/react-query"
import { CreditCard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/ui/status-badge"
import { openBillingPortal } from "@/lib/api/queries"
import { leaveFor } from "@/lib/config/urls"
import {
  amountEur,
  type BillingIntervalName,
  formatEur,
  INTERVAL_LABELS,
  isBillingIntervalName,
  subscriptionStatusLook,
} from "@/lib/domain/billing"
import { formatDateTime } from "@/lib/utils/format"

export interface SubscriptionCardSubscription {
  product: string
  quantity: number
  status: string
  interval: string | null
  current_period_end: string | null
}

export interface SubscriptionCardProps {
  organizationId: string
  subscription: SubscriptionCardSubscription
}

function intervalOf(value: string | null): BillingIntervalName | null {
  return isBillingIntervalName(value) ? value : null
}

export function SubscriptionCard({
  organizationId,
  subscription,
}: SubscriptionCardProps) {
  const portal = useMutation({
    mutationFn: () => openBillingPortal(organizationId),
    onSuccess: leaveFor,
  })
  const interval = intervalOf(subscription.interval)
  const seats = subscription.quantity

  return (
    <Card>
      <CardHeader>
        <CardTitle>Abonnement</CardTitle>
        <StatusBadge look={subscriptionStatusLook(subscription.status)} />
      </CardHeader>
      <CardBody className="flex flex-col gap-gutter">
        <dl className="grid gap-gutter sm:grid-cols-2">
          <div>
            <dt className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
              Produit
            </dt>
            <dd className="mt-1 font-data text-[12px] text-ink">
              {subscription.product}
            </dd>
          </div>
          <div>
            <dt className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
              Sièges
            </dt>
            <dd className="mt-1 font-data text-[12px] text-ink tabular-nums">
              {seats} {seats > 1 ? "serveurs" : "serveur"}
            </dd>
          </div>
          <div>
            <dt className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
              Montant
            </dt>
            <dd className="mt-1 font-data text-[12px] text-ink tabular-nums">
              {formatEur(amountEur(seats, interval))}
              <span className="text-ink-3">
                {interval === "year" ? " par an" : " par mois"}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
              Période
            </dt>
            <dd className="mt-1 text-[13px] text-ink-2">
              {interval ? INTERVAL_LABELS[interval] : "Inconnue"}
              {subscription.current_period_end ? (
                <>
                  {" · jusqu'au "}
                  <span className="font-data text-[12px] tabular-nums">
                    {formatDateTime(subscription.current_period_end)}
                  </span>
                </>
              ) : null}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={portal.isPending}
            onClick={() => {
              portal.mutate()
            }}
            variant="primary"
          >
            <CreditCard className="size-4" strokeWidth={1.5} />
            {portal.isPending
              ? "Ouverture du portail…"
              : "Gérer l'abonnement sur Stripe"}
          </Button>
          <p className="text-[13px] text-ink-2">
            Sièges, moyen de paiement, factures et résiliation vivent dans le
            portail Stripe.
          </p>
        </div>

        {portal.isError ? (
          <Callout
            fix="Réessayez dans un instant ; si cela persiste, passez par un premier paiement pour créer le client Stripe."
            title="Le portail n'a pas pu être ouvert."
            tone="danger"
          />
        ) : null}
      </CardBody>
    </Card>
  )
}
