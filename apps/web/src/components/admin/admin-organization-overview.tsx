import { Link } from "@tanstack/react-router"
import type { AdminFact } from "@/components/admin/admin-facts"
import { AdminFacts } from "@/components/admin/admin-facts"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { CopyButton } from "@/components/ui/copy-button"
import { StatusBadge } from "@/components/ui/status-badge"
import { useTranslations } from "@/hooks/use-locale"
import type { AdminOrganizationDetail } from "@/lib/api/admin-queries"
import { organizationLook } from "@/lib/domain/admin"
import { affiliateUrlFor } from "@/lib/domain/affiliate"
import { subscriptionStatusLook } from "@/lib/domain/billing"
import { formatDate, formatDateTime } from "@/lib/utils/format"

export interface AdminOrganizationOverviewProps {
  detail: AdminOrganizationDetail
}

const OWNER_ROLE = "owner"

export function AdminOrganizationOverview({
  detail,
}: AdminOrganizationOverviewProps) {
  const t = useTranslations()
  const referralUrl = detail.referral
    ? affiliateUrlFor(detail.referral.code)
    : null
  const live = detail.subscription
    ? subscriptionStatusLook(
        detail.subscription.status,
        detail.subscription.product
      )
    : null
  const owners = detail.members.filter((member) => member.role === OWNER_ROLE)
  const reason = detail.reason
  const counted = detail.subscription

  const facts: AdminFact[] = [
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
      label: t("admin.organizations.seats"),
      value: `${detail.seats.paid} · ${detail.seats.used}`,
    },
    {
      label: t("admin.organizations.liveSubscription"),
      value:
        live && counted ? (
          <Link
            className="underline-offset-2 hover:underline"
            params={{ id: counted.id }}
            to="/dashboard/admin/subscriptions/$id"
          >
            {t(live.label)}
          </Link>
        ) : (
          t("admin.users.noSubscription")
        ),
    },
    {
      label: t("admin.organizations.referral"),
      value: detail.referral
        ? `${detail.referral.name} · ${detail.referral.code}`
        : t("format.none"),
    },
  ]

  if (reason) {
    facts.push({ label: t("admin.organizations.stateReason"), value: reason })
  }

  if (detail.suspended_at) {
    facts.push({
      label: t("admin.organizations.suspendedAt"),
      value: formatDateTime(detail.suspended_at, t),
    })
  }

  if (detail.closed_at) {
    facts.push({
      label: t("admin.organizations.closedAt"),
      value: formatDateTime(detail.closed_at, t),
    })
  }

  if (detail.deletion_at) {
    facts.push({
      label: t("admin.organizations.deletionAt"),
      value: formatDateTime(detail.deletion_at, t),
    })
  }

  return (
    <div className="flex flex-col gap-gutter">
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.organizations.profile")}</CardTitle>
          <StatusBadge look={organizationLook(detail.state)} />
        </CardHeader>

        <AdminFacts facts={facts} />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.organizations.owners")}</CardTitle>
        </CardHeader>

        {owners.length === 0 ? (
          <CardBody>
            <p className="text-[13px] text-ink-3">
              {t("admin.organizations.noOwner")}
            </p>
          </CardBody>
        ) : (
          <ul>
            {owners.map((owner) => (
              <li
                className="flex flex-wrap items-center gap-4 border-line border-b px-4 py-3 last:border-b-0"
                key={owner.user_id}
              >
                <Link
                  className="min-w-0 flex-1 truncate font-data text-[13px] text-ink underline-offset-2 hover:underline"
                  params={{ id: owner.user_id }}
                  to="/dashboard/admin/users/$id"
                >
                  {owner.email}
                </Link>
                <span className="font-data text-[12px] text-ink-3 tabular-nums">
                  {formatDate(owner.created_at, t)}
                </span>
              </li>
            ))}
          </ul>
        )}
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
    </div>
  )
}
