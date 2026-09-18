import { Link } from "@tanstack/react-router"
import { StatusBadge } from "@/components/ui/status-badge"
import { useTranslations } from "@/hooks/use-locale"
import { userLook } from "@/lib/domain/admin"
import { subscriptionStatusLook } from "@/lib/domain/billing"
import { roleKey } from "@/lib/domain/roles"
import { formatDateTime } from "@/lib/utils/format"

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

export interface AdminUserRowProps {
  user: AdminUserRowUser
}

export function AdminUserRow({ user }: AdminUserRowProps) {
  const t = useTranslations()

  function subscriptionName(status: string | null): string {
    if (status === null) {
      return t("admin.users.noSubscription")
    }

    const look = subscriptionStatusLook(status)

    return look ? t(look.label) : status
  }

  function roleName(role: string): string {
    const key = roleKey(role)

    return key ? t(key) : role
  }

  return (
    <li className="flex flex-wrap items-start justify-between gap-4 border-line border-b px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <Link
          className="block truncate font-medium text-[13px] text-ink underline-offset-2 hover:underline"
          params={{ id: user.id }}
          to="/dashboard/admin/users/$id"
        >
          {user.name}
        </Link>
        <p className="truncate font-data text-[12px] text-ink-3">
          {user.email}
        </p>
        <p className="mt-1 text-[12px] text-ink-3">
          {t("admin.users.created", {
            date: formatDateTime(user.created_at, t),
          })}
          {user.role ? <span className="font-data"> · {user.role}</span> : null}
        </p>
      </div>

      <StatusBadge className="shrink-0 sm:w-40" look={userLook(user)} />

      <ul className="flex w-full flex-col gap-1 sm:w-[300px]">
        {user.organizations.length === 0 ? (
          <li className="text-[12px] text-ink-3">
            {t("admin.users.noOrganization")}
          </li>
        ) : null}

        {user.organizations.map((organization) => (
          <li className="min-w-0" key={organization.id}>
            <p className="truncate text-[13px] text-ink">
              <Link
                className="underline-offset-2 hover:underline"
                params={{ id: organization.id }}
                to="/dashboard/admin/organizations/$id"
              >
                {organization.name}
              </Link>
              <span className="text-ink-3">
                {" "}
                · {roleName(organization.role)}
              </span>
            </p>
            <p className="truncate font-data text-[12px] text-ink-3">
              {subscriptionName(organization.subscription_status)} ·{" "}
              {t.plural("admin.users.servers", organization.servers)}
            </p>
          </li>
        ))}
      </ul>
    </li>
  )
}
