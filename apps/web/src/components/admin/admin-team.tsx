import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Users } from "lucide-react"
import { AdminFailure } from "@/components/admin/admin-failure"
import { buttonClassName } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { SkeletonRows } from "@/components/ui/skeleton"
import { useTranslations } from "@/hooks/use-locale"
import { adminTeamQueryOptions } from "@/lib/api/admin-queries"
import { roleKey } from "@/lib/domain/roles"
import { formatDate } from "@/lib/utils/format"

export function AdminTeam() {
  const t = useTranslations()
  const team = useQuery(adminTeamQueryOptions())

  function roleName(role: string): string {
    const key = roleKey(role)

    return key ? t(key) : role
  }

  return (
    <div className="flex flex-col gap-gutter">
      <Callout
        action={
          <Link
            className={buttonClassName({ size: "sm" })}
            to="/dashboard/members"
          >
            <Users className="size-4 shrink-0" strokeWidth={1.5} />
            {t("admin.team.manage")}
          </Link>
        }
        title={t("admin.team.rolesLiveOnTheOrganization")}
      />

      {team.isPending ? <SkeletonRows label={t("admin.reading")} /> : null}

      {team.isError ? (
        <AdminFailure
          fetching={team.isFetching}
          onRetry={() => {
            team.refetch()
          }}
        />
      ) : null}

      {team.isSuccess ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.team.title")}</CardTitle>
            <span className="font-data text-[12px] text-ink-3 tabular-nums">
              {team.data.length}
            </span>
          </CardHeader>

          <ul>
            {team.data.map((member) => (
              <li
                className="flex flex-wrap items-center gap-4 border-line border-b px-4 py-3 last:border-b-0"
                key={member.user_id}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-ink">{member.name}</p>
                  <p className="truncate font-data text-[12px] text-ink-3">
                    {member.email}
                  </p>
                </div>
                <span className="text-[12px] text-ink-2 sm:w-24">
                  {roleName(member.role)}
                </span>
                <span className="font-data text-[12px] text-ink-3 tabular-nums sm:w-28 sm:text-right">
                  {formatDate(member.created_at, t)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}
