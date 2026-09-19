import type { DataColumn } from "@/components/ui/async-data-table"
import { StatusBadge } from "@/components/ui/status-badge"
import { organizationLook } from "@/lib/domain/admin"
import { subscriptionStatusLook } from "@/lib/domain/billing"
import type { Translate } from "@/lib/i18n/i18n"
import { formatDate } from "@/lib/utils/format"

export interface AdminOrganizationRowOrganization {
  id: string
  name: string
  slug: string
  personal: boolean
  created_at: string
  state: string
  members: number
  servers: number
  subscription: { status: string; product: string | null } | null
  referral: { code: string; name: string } | null
}

export function adminOrganizationColumns(
  t: Translate
): DataColumn<AdminOrganizationRowOrganization>[] {
  return [
    {
      key: "name",
      header: t("admin.organizations.profile"),
      cell: (organization) => (
        <>
          <span className="block truncate">{organization.name}</span>
          <span className="block truncate font-data text-[12px] text-ink-3">
            {organization.slug}
            {organization.personal
              ? ` · ${t("admin.organizations.personal")}`
              : ""}
          </span>
        </>
      ),
    },
    {
      key: "state",
      header: t("admin.users.state"),
      width: "w-40",
      cell: (organization) => (
        <StatusBadge look={organizationLook(organization.state)} />
      ),
    },
    {
      key: "counts",
      header: t("admin.organizations.memberCount"),
      width: "w-32",
      hideBelow: "md",
      cell: (organization) => (
        <>
          <p>{t.plural("admin.organizations.members", organization.members)}</p>
          <p>{t.plural("admin.users.servers", organization.servers)}</p>
        </>
      ),
    },
    {
      key: "subscription",
      header: t("admin.subscriptions.profile"),
      width: "w-36",
      cell: (organization) => {
        const look = organization.subscription
          ? subscriptionStatusLook(
              organization.subscription.status,
              organization.subscription.product
            )
          : null

        return look ? t(look.label) : t("admin.users.noSubscription")
      },
    },
    {
      key: "referral",
      header: t("admin.organizations.referral"),
      width: "w-28",
      hideBelow: "lg",
      cell: (organization) => (
        <span className="font-data text-[12px] text-ink-3">
          {organization.referral?.code ?? t("format.none")}
        </span>
      ),
    },
    {
      key: "created_at",
      header: t("admin.users.createdAt"),
      width: "w-28",
      align: "end",
      hideBelow: "sm",
      cell: (organization) => (
        <span className="font-data text-[12px] text-ink-3">
          {formatDate(organization.created_at, t)}
        </span>
      ),
    },
  ]
}
