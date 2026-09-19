import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Users } from "lucide-react"
import {
  type AdminTeamRowMember,
  adminTeamColumns,
} from "@/components/admin/admin-team-columns"
import { AsyncDataTable } from "@/components/ui/async-data-table"
import { buttonClassName } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { useTranslations } from "@/hooks/use-locale"
import { adminTeamQueryOptions } from "@/lib/api/admin-queries"

const PAGE_SIZE = 50

export function AdminTeam() {
  const t = useTranslations()
  const team = useQuery(adminTeamQueryOptions())
  const members: AdminTeamRowMember[] = team.data ?? []

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

      <AsyncDataTable
        columns={adminTeamColumns(t)}
        data={members}
        emptyIcon={Users}
        emptyTitle={t("admin.team.empty")}
        isError={team.isError}
        isFetching={team.isFetching}
        isPending={team.isPending}
        limit={PAGE_SIZE}
        offset={0}
        onOffsetChange={() => undefined}
        refetch={() => {
          team.refetch()
        }}
        rowKey={(member) => member.user_id}
        title={t("admin.team.title")}
        total={members.length}
      />
    </div>
  )
}
