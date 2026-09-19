import { Link } from "@tanstack/react-router"
import type { DataColumn } from "@/components/ui/async-data-table"
import { StatusBadge } from "@/components/ui/status-badge"
import { userLook } from "@/lib/domain/admin"
import { subscriptionStatusLook } from "@/lib/domain/billing"
import { roleKey } from "@/lib/domain/roles"
import type { Translate } from "@/lib/i18n/i18n"
import { formatDate } from "@/lib/utils/format"

export interface AdminUserRowOrganization {
  id: string
  name: string
  slug: string
  role: string
  subscription_status: string | null
  servers: number
}

export interface AdminUserRowUser {
  id: string
  email: string
  name: string
  role: string | null
  banned: boolean
  email_verified: boolean
  created_at: string
  organizations: AdminUserRowOrganization[]
}

function subscriptionName(status: string | null, t: Translate): string {
  if (status === null) {
    return t("admin.users.noSubscription")
  }

  const look = subscriptionStatusLook(status)

  return look ? t(look.label) : status
}

function roleName(role: string, t: Translate): string {
  const key = roleKey(role)

  return key ? t(key) : role
}

export function adminUserColumns(t: Translate): DataColumn<AdminUserRowUser>[] {
  return [
    {
      key: "name",
      header: t("admin.users.name"),
      cell: (user) => (
        <>
          <span className="block truncate">{user.name}</span>
          <span className="block truncate font-data text-[12px] text-ink-3">
            {user.email}
          </span>
        </>
      ),
    },
    {
      key: "state",
      header: t("admin.users.state"),
      width: "w-40",
      cell: (user) => <StatusBadge look={userLook(user)} />,
    },
    {
      key: "role",
      header: t("admin.users.platformRole"),
      width: "w-36",
      hideBelow: "lg",
      cell: (user) => (
        <span className="font-data text-[12px]">
          {user.role ?? t("format.none")}
        </span>
      ),
    },
    {
      key: "organizations",
      header: t("admin.users.organizations"),
      width: "w-[280px]",
      hideBelow: "md",
      cell: (user) =>
        user.organizations.length === 0 ? (
          <span className="text-[12px] text-ink-3">
            {t("admin.users.noOrganization")}
          </span>
        ) : (
          <ul className="flex flex-col gap-1">
            {user.organizations.map((organization) => (
              <li className="min-w-0" key={organization.id}>
                <p className="truncate text-[13px] text-ink">
                  <Link
                    className="relative underline-offset-2 hover:underline"
                    params={{ id: organization.id }}
                    to="/dashboard/admin/organizations/$id"
                  >
                    {organization.name}
                  </Link>
                  <span className="text-ink-3">
                    {" "}
                    · {roleName(organization.role, t)}
                  </span>
                </p>
                <p className="truncate font-data text-[12px] text-ink-3">
                  {subscriptionName(organization.subscription_status, t)} ·{" "}
                  {t.plural("admin.users.servers", organization.servers)}
                </p>
              </li>
            ))}
          </ul>
        ),
    },
    {
      key: "created_at",
      header: t("admin.users.createdAt"),
      width: "w-28",
      align: "end",
      hideBelow: "sm",
      cell: (user) => (
        <span className="font-data text-[12px] text-ink-3">
          {formatDate(user.created_at, t)}
        </span>
      ),
    },
  ]
}
