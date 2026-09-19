import { Link } from "@tanstack/react-router"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslations } from "@/hooks/use-locale"
import type { AffiliateLinkDetail } from "@/lib/api/admin-queries"
import { subscriptionStatusLook } from "@/lib/domain/billing"
import { formatDate } from "@/lib/utils/format"

export interface AdminAffiliateLinkOrganizationsProps {
  organizations: AffiliateLinkDetail["organizations"]
}

export function AdminAffiliateLinkOrganizations({
  organizations,
}: AdminAffiliateLinkOrganizationsProps) {
  const t = useTranslations()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.links.referredOrganizations")}</CardTitle>
      </CardHeader>

      {organizations.length === 0 ? (
        <CardBody>
          <p className="text-[13px] text-ink-3">
            {t("admin.links.noReferral")}
          </p>
        </CardBody>
      ) : (
        <ul>
          {organizations.map((organization) => {
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
  )
}
