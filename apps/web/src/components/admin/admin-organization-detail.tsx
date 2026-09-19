import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { AdminEventsCard } from "@/components/admin/admin-events-card"
import { AdminFacts } from "@/components/admin/admin-facts"
import { AdminFailure } from "@/components/admin/admin-failure"
import { AdminGrantDialog } from "@/components/admin/admin-grant-dialog"
import { AdminSubscriptionStatus } from "@/components/admin/admin-subscription-status"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { CopyButton } from "@/components/ui/copy-button"
import { SkeletonCards } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/ui/status-badge"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { adminOrganizationQueryOptions } from "@/lib/api/admin-queries"
import { canActOnPlatform, subscriptionIsLive } from "@/lib/domain/admin"
import { affiliateUrlFor } from "@/lib/domain/affiliate"
import { subscriptionStatusLook } from "@/lib/domain/billing"
import { roleKey } from "@/lib/domain/roles"
import { statusLook } from "@/lib/domain/server-status"
import { formatDate, formatDateTime, formatProduct } from "@/lib/utils/format"

export interface AdminOrganizationDetailProps {
  id: string
}

export function AdminOrganizationDetail({ id }: AdminOrganizationDetailProps) {
  const t = useTranslations()
  const { platformRole } = useDashboardContext()
  const organization = useQuery(adminOrganizationQueryOptions(id))

  if (organization.isPending) {
    return <SkeletonCards label={t("admin.reading")} />
  }

  if (organization.isError) {
    return (
      <AdminFailure
        fetching={organization.isFetching}
        onRetry={() => {
          organization.refetch()
        }}
      />
    )
  }

  const detail = organization.data
  const referralUrl = detail.referral
    ? affiliateUrlFor(detail.referral.code)
    : null
  const live = detail.subscription
    ? subscriptionStatusLook(
        detail.subscription.status,
        detail.subscription.product
      )
    : null
  const hasLive = detail.subscription
    ? subscriptionIsLive(detail.subscription.status)
    : false
  const acts = canActOnPlatform(platformRole)

  function roleName(role: string): string {
    const key = roleKey(role)

    return key ? t(key) : role
  }

  return (
    <div className="flex flex-col gap-gutter">
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.organizations.profile")}</CardTitle>
          {live ? <StatusBadge look={live} /> : null}
        </CardHeader>

        <AdminFacts
          facts={[
            { label: t("admin.organizations.slug"), value: detail.slug },
            {
              label: t("admin.organizations.kind"),
              value: detail.personal
                ? t("admin.organizations.personal")
                : t("admin.organizations.shared"),
            },
            {
              label: t("admin.users.createdAt"),
              value: formatDateTime(detail.created_at, t),
            },
            {
              label: t("admin.organizations.memberCount"),
              value: detail.members.length,
            },
            {
              label: t("admin.organizations.serverCount"),
              value: detail.servers.length,
            },
            {
              label: t("admin.organizations.referral"),
              value: detail.referral
                ? `${detail.referral.name} · ${detail.referral.code}`
                : t("format.none"),
            },
          ]}
        />
      </Card>

      {referralUrl ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.organizations.referralLink")}</CardTitle>
          </CardHeader>
          <CardBody className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-data text-[12px] text-ink-2">
              {referralUrl}
            </span>
            <CopyButton
              copiedLabel={t("admin.links.copied")}
              failedLabel={t("admin.links.copyFailed")}
              label={t("admin.links.copy")}
              value={referralUrl}
            />
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.organizations.members")}</CardTitle>
        </CardHeader>

        {detail.members.length === 0 ? (
          <CardBody>
            <p className="text-[13px] text-ink-3">
              {t("admin.organizations.noMember")}
            </p>
          </CardBody>
        ) : (
          <ul>
            {detail.members.map((member) => (
              <li
                className="flex flex-wrap items-center gap-4 border-line border-b px-4 py-3 last:border-b-0"
                key={member.user_id}
              >
                <Link
                  className="min-w-0 flex-1 truncate text-[13px] text-ink underline-offset-2 hover:underline"
                  params={{ id: member.user_id }}
                  to="/dashboard/admin/users/$id"
                >
                  {member.name}
                </Link>
                <span className="min-w-0 truncate font-data text-[12px] text-ink-3 sm:w-56">
                  {member.email}
                </span>
                <span className="text-[12px] text-ink-2 sm:w-24">
                  {roleName(member.role)}
                </span>
                <span className="font-data text-[12px] text-ink-3 tabular-nums sm:w-28 sm:text-right">
                  {formatDate(member.created_at, t)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.organizations.servers")}</CardTitle>
        </CardHeader>

        {detail.servers.length === 0 ? (
          <CardBody>
            <p className="text-[13px] text-ink-3">
              {t("admin.organizations.noServer")}
            </p>
          </CardBody>
        ) : (
          <ul>
            {detail.servers.map((server) => (
              <li
                className="flex flex-wrap items-center gap-4 border-line border-b px-4 py-3 last:border-b-0"
                key={server.id}
              >
                <Link
                  className="min-w-0 flex-1 truncate text-[13px] text-ink underline-offset-2 hover:underline"
                  params={{ id: server.id }}
                  to="/dashboard/admin/servers/$id"
                >
                  {server.name}
                </Link>
                <span className="min-w-0 truncate font-data text-[12px] text-ink-3 sm:w-56">
                  {server.host ?? t("servers.unknownHost")}
                </span>
                <StatusBadge look={statusLook(server.status, server.stale)} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.organizations.subscriptions")}</CardTitle>
          {acts ? (
            <AdminGrantDialog blocked={hasLive} organization={detail} />
          ) : null}
        </CardHeader>

        {detail.subscriptions.length === 0 ? (
          <CardBody>
            <p className="text-[13px] text-ink-3">
              {t("admin.organizations.noSubscription")}
            </p>
          </CardBody>
        ) : (
          <ul>
            {detail.subscriptions.map((subscription) => (
              <li
                className="flex flex-wrap items-center gap-4 border-line border-b px-4 py-3 last:border-b-0"
                key={subscription.id}
              >
                <Link
                  className="min-w-0 flex-1 truncate font-data text-[12px] text-ink underline-offset-2 hover:underline"
                  params={{ id: subscription.id }}
                  to="/dashboard/admin/subscriptions/$id"
                >
                  {subscription.stripe_subscription_id}
                </Link>
                <span className="text-[12px] text-ink-2 sm:w-32">
                  {formatProduct(subscription.product, t)}
                </span>
                <span className="font-data text-[12px] text-ink-2 tabular-nums sm:w-24">
                  {t.plural("admin.links.seats", subscription.quantity)}
                </span>
                <AdminSubscriptionStatus
                  className="sm:w-36"
                  product={subscription.product}
                  status={subscription.status}
                />
                <span className="font-data text-[12px] text-ink-3 tabular-nums sm:w-28 sm:text-right">
                  {subscription.current_period_end
                    ? formatDate(subscription.current_period_end, t)
                    : t("format.none")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <AdminEventsCard
        events={detail.events.map((event) => ({
          ...event,
          actor: event.actor?.email ?? null,
        }))}
      />
    </div>
  )
}
