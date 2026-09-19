import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { StatusDot } from "@/components/ui/status-dot"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { usePermission } from "@/hooks/use-permission"
import { type Subscription, subscriptionQueryOptions } from "@/lib/api/queries"
import { isLaunchSubscription } from "@/lib/domain/billing"
import { entitlementNotice, type LaunchNotice } from "@/lib/domain/onboarding"
import { formatDateTime } from "@/lib/utils/format"

const SHELL =
  "flex items-center gap-2 rounded-md bg-sunken px-2.5 py-2 text-[12px] text-ink-2"

/** Nothing read yet — a disabled query, a pending one — is not the same as no subscription. */
function subscriptionStateOf(data: Subscription | null | undefined): string {
  if (data === undefined) {
    return "unknown"
  }

  return data ? data.status : "none"
}

function launchOf(data: Subscription | null | undefined): LaunchNotice | null {
  return data && isLaunchSubscription(data)
    ? { endsAt: data.current_period_end }
    : null
}

export function SidebarEntitlement() {
  const t = useTranslations()
  const { entitlement, activeOrganization } = useDashboardContext()
  const canManageBilling = usePermission("billing:manage")
  const organizationId = activeOrganization?.id ?? ""
  const subscription = useQuery({
    ...subscriptionQueryOptions(organizationId),
    enabled: canManageBilling && organizationId !== "",
  })
  const launch = launchOf(subscription.data)
  const notice = entitlementNotice({
    entitlement,
    subscription: subscriptionStateOf(subscription.data),
    canManageBilling,
    launch,
  })

  if (!notice) {
    return null
  }

  const label = t(notice.label, {
    date: launch?.endsAt ? formatDateTime(launch.endsAt, t) : "",
  })

  const body = (
    <>
      <StatusDot
        label={label}
        shape={notice.look.shape}
        tone={notice.look.tone}
      />
      <span className="truncate">{label}</span>
    </>
  )

  if (!notice.to) {
    return <p className={SHELL}>{body}</p>
  }

  return (
    <Link
      className={`${SHELL} transition-fast hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2`}
      to={notice.to}
    >
      {body}
    </Link>
  )
}
