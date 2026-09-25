import { StatusBadge } from "@/components/ui/status-badge"
import { subscriptionStatusLook } from "@/lib/domain/billing"
import { cn } from "@/lib/utils/cn"

export interface AdminSubscriptionStatusProps {
  status: string
  product: string | null
  className?: string
}

// A status Stripe adds later still shows, in Stripe's own words.
export function AdminSubscriptionStatus({
  status,
  product,
  className,
}: AdminSubscriptionStatusProps) {
  const look = subscriptionStatusLook(status, product)

  if (look) {
    return <StatusBadge className={className} look={look} />
  }

  return (
    <span className={cn("font-data text-[12px] text-ink-2", className)}>
      {status}
    </span>
  )
}
