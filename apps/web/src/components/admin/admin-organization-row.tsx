import { Link } from "@tanstack/react-router"
import { useTranslations } from "@/hooks/use-locale"
import { subscriptionStatusLook } from "@/lib/domain/billing"
import { formatDate } from "@/lib/utils/format"

export interface AdminOrganizationRowOrganization {
  id: string
  name: string
  slug: string
  personal: boolean
  created_at: string
  members: number
  servers: number
  subscription: { status: string; product: string | null } | null
  referral: { code: string; name: string } | null
}

export interface AdminOrganizationRowProps {
  organization: AdminOrganizationRowOrganization
}

export function AdminOrganizationRow({
  organization,
}: AdminOrganizationRowProps) {
  const t = useTranslations()
  const look = organization.subscription
    ? subscriptionStatusLook(
        organization.subscription.status,
        organization.subscription.product
      )
    : null

  return (
    <li className="flex flex-wrap items-center gap-4 border-line border-b px-4 py-3 last:border-b-0 sm:gap-6">
      <div className="min-w-0 flex-1">
        <Link
          className="block truncate font-medium text-[13px] text-ink underline-offset-2 hover:underline"
          params={{ id: organization.id }}
          to="/dashboard/admin/organizations/$id"
        >
          {organization.name}
        </Link>
        <p className="truncate font-data text-[12px] text-ink-3">
          {organization.slug}
          {organization.personal
            ? ` · ${t("admin.organizations.personal")}`
            : ""}
        </p>
      </div>

      <div className="text-[12px] text-ink-2 tabular-nums sm:w-32">
        <p>{t.plural("admin.organizations.members", organization.members)}</p>
        <p>{t.plural("admin.users.servers", organization.servers)}</p>
      </div>

      <p className="text-[12px] text-ink-2 sm:w-36">
        {look ? t(look.label) : t("admin.users.noSubscription")}
      </p>

      <p className="truncate font-data text-[12px] text-ink-3 sm:w-28">
        {organization.referral?.code ?? t("format.none")}
      </p>

      <p className="font-data text-[12px] text-ink-3 tabular-nums sm:w-28 sm:text-right">
        {formatDate(organization.created_at, t)}
      </p>
    </li>
  )
}
