import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { AdminFacts } from "@/components/admin/admin-facts"
import { AdminFailure } from "@/components/admin/admin-failure"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { CopyButton } from "@/components/ui/copy-button"
import { SkeletonCards } from "@/components/ui/skeleton"
import { StatusDot } from "@/components/ui/status-dot"
import { useTranslations } from "@/hooks/use-locale"
import { affiliateLinkQueryOptions } from "@/lib/api/admin-queries"
import { subscriptionStatusLook } from "@/lib/domain/billing"
import { formatDate, formatDateTime } from "@/lib/utils/format"

export interface AdminAffiliateLinkDetailProps {
  id: string
}

export function AdminAffiliateLinkDetail({
  id,
}: AdminAffiliateLinkDetailProps) {
  const t = useTranslations()
  const link = useQuery(affiliateLinkQueryOptions(id))

  if (link.isPending) {
    return <SkeletonCards label={t("admin.reading")} />
  }

  if (link.isError) {
    return (
      <AdminFailure
        fetching={link.isFetching}
        onRetry={() => {
          link.refetch()
        }}
      />
    )
  }

  const detail = link.data
  const state = detail.disabled
    ? t("admin.links.disabled")
    : t("admin.links.enabled")

  return (
    <div className="flex flex-col gap-gutter">
      <Card>
        <CardHeader>
          <CardTitle>{detail.name}</CardTitle>
          <span className="inline-flex items-center gap-2 text-[13px] text-ink-2">
            <StatusDot
              label={state}
              shape={detail.disabled ? "hollow" : "filled"}
              tone={detail.disabled ? "muted" : "ok"}
            />
            {state}
          </span>
        </CardHeader>

        <AdminFacts
          facts={[
            { label: t("admin.links.code"), value: detail.code },
            {
              label: t("admin.links.freeMonthsField"),
              value: detail.free_months,
            },
            { label: t("admin.links.seatsField"), value: detail.seats },
            {
              label: t("admin.users.createdAt"),
              value: formatDateTime(detail.created_at, t),
            },
            {
              label: t("admin.links.referredOrganizations"),
              value: detail.referrals,
            },
          ]}
        />

        <CardBody className="flex items-center gap-2 border-line border-t">
          <span className="min-w-0 flex-1 truncate font-data text-[12px] text-ink-2">
            {detail.url}
          </span>
          <CopyButton
            copiedLabel={t("admin.links.copied")}
            failedLabel={t("admin.links.copyFailed")}
            label={t("admin.links.copy")}
            value={detail.url}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.links.referredOrganizations")}</CardTitle>
        </CardHeader>

        {detail.organizations.length === 0 ? (
          <CardBody>
            <p className="text-[13px] text-ink-3">
              {t("admin.links.noReferral")}
            </p>
          </CardBody>
        ) : (
          <ul>
            {detail.organizations.map((organization) => {
              const look = organization.subscription_status
                ? subscriptionStatusLook(organization.subscription_status)
                : null

              return (
                <li
                  className="flex flex-wrap items-center gap-4 border-line border-b px-4 py-3 last:border-b-0"
                  key={organization.id}
                >
                  <Link
                    className="min-w-0 flex-1 truncate text-[13px] text-ink underline-offset-2 hover:underline"
                    params={{ id: organization.id }}
                    to="/dashboard/admin/organizations/$id"
                  >
                    {organization.name}
                  </Link>
                  <span className="min-w-0 truncate font-data text-[12px] text-ink-3 sm:w-40">
                    {organization.slug}
                  </span>
                  <span className="text-[12px] text-ink-2 sm:w-36">
                    {look ? t(look.label) : t("admin.users.noSubscription")}
                  </span>
                  <span className="font-data text-[12px] text-ink-3 tabular-nums sm:w-28 sm:text-right">
                    {formatDate(organization.referred_at, t)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
