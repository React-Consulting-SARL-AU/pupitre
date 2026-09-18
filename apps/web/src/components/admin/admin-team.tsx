import { PLATFORM_ORGANIZATION_ID } from "@pupitre/shared/platform"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Users } from "lucide-react"
import { useState } from "react"
import { AdminFailure } from "@/components/admin/admin-failure"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { SkeletonRows } from "@/components/ui/skeleton"
import { useTranslations } from "@/hooks/use-locale"
import { adminTeamQueryOptions } from "@/lib/api/admin-queries"
import { isOrganizationScoped, queryKeys } from "@/lib/api/queries"
import { authClient } from "@/lib/auth/client"
import { roleKey } from "@/lib/domain/roles"
import { formatDate } from "@/lib/utils/format"

export function AdminTeam() {
  const t = useTranslations()
  const team = useQuery(adminTeamQueryOptions())
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [switching, setSwitching] = useState(false)

  async function manageRoles() {
    setSwitching(true)
    await authClient().organization.setActive({
      organizationId: PLATFORM_ORGANIZATION_ID,
    })

    queryClient.removeQueries({
      predicate: (query) => isOrganizationScoped(query.queryKey),
    })
    await queryClient.invalidateQueries({ queryKey: queryKeys.me })
    await navigate({ to: "/dashboard/members" })
    setSwitching(false)
  }

  function roleName(role: string): string {
    const key = roleKey(role)

    return key ? t(key) : role
  }

  return (
    <div className="flex flex-col gap-gutter">
      <Callout
        action={
          <Button
            icon={Users}
            loading={switching}
            onClick={() => {
              manageRoles()
            }}
            size="sm"
          >
            {t("admin.team.manage")}
          </Button>
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
