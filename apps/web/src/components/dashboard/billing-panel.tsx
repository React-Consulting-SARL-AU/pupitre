import { useQuery } from "@tanstack/react-query"
import { Lock } from "lucide-react"
import { CheckoutForm } from "@/components/dashboard/checkout-form"
import { SeatBalanceCard } from "@/components/dashboard/seat-balance-card"
import { SubscriptionCard } from "@/components/dashboard/subscription-card"
import { Callout } from "@/components/ui/callout"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { usePermission } from "@/hooks/use-permission"
import {
  serversQueryOptions,
  subscriptionQueryOptions,
} from "@/lib/api/queries"
import { FREE_SEAT_QUOTA, seatBalance } from "@/lib/domain/billing"

const SEATED_STATUSES = new Set(["enrolling", "active", "grace", "suspended"])

interface SeatedServer {
  status: string
}

function countSeated(servers: SeatedServer[] | undefined): number {
  return (servers ?? []).filter((server) => SEATED_STATUSES.has(server.status))
    .length
}

export function BillingPanel() {
  const { activeOrganization } = useDashboardContext()
  const canManage = usePermission("billing:manage")
  const organizationId = activeOrganization?.id ?? ""
  const enabled = canManage && organizationId !== ""
  const subscription = useQuery({
    ...subscriptionQueryOptions(organizationId),
    enabled,
  })
  const servers = useQuery({ ...serversQueryOptions(), enabled })

  if (!canManage) {
    return (
      <EmptyState
        description="Seul le propriétaire de l'organisation voit l'abonnement, le montant et le portail de paiement. Demandez-lui un siège de plus si vous en manquez un."
        icon={Lock}
        title="La facturation est réservée au propriétaire"
      />
    )
  }

  if (!activeOrganization) {
    return (
      <EmptyState
        description="Choisissez une organisation dans la barre latérale pour voir son abonnement."
        icon={Lock}
        title="Aucune organisation active"
      />
    )
  }

  if (subscription.isPending || servers.isPending) {
    return <LoadingState label="Lecture de l'abonnement…" />
  }

  if (subscription.isError) {
    return (
      <Callout
        fix="Rechargez la page ; si cela persiste, reconnectez-vous."
        title="L'abonnement n'a pas pu être lu."
        tone="danger"
      />
    )
  }

  const used = countSeated(servers.data as SeatedServer[] | undefined)
  const paid = subscription.data?.quantity ?? FREE_SEAT_QUOTA

  return (
    <div className="flex flex-col gap-section">
      {subscription.data ? (
        <SubscriptionCard
          organizationId={activeOrganization.id}
          subscription={subscription.data}
        />
      ) : (
        <CheckoutForm
          defaultQuantity={Math.max(used, 1)}
          organizationId={activeOrganization.id}
        />
      )}

      <SeatBalanceCard
        balance={seatBalance(paid, used)}
        paidSeats={subscription.data !== null}
      />
    </div>
  )
}
