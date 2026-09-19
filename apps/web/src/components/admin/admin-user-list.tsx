import { ACCOUNT_STATES, ADMIN_PAGE_SIZE } from "@pupitre/shared/platform"
import { useQuery } from "@tanstack/react-query"
import { UsersRound } from "lucide-react"
import { adminUserColumns } from "@/components/admin/admin-user-columns"
import { AsyncDataTable } from "@/components/ui/async-data-table"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { useTranslations } from "@/hooks/use-locale"
import { adminUsersQueryOptions } from "@/lib/api/admin-queries"
import { accountLook } from "@/lib/domain/admin"
import type { ListSearchHandle } from "@/lib/domain/list-search"

const ALL_STATES = ""

export interface AdminUserListSearch {
  q?: string
  offset?: number
  state?: string
}

export type AdminUserListProps = ListSearchHandle<AdminUserListSearch>

export function AdminUserList({ search, setSearch }: AdminUserListProps) {
  const t = useTranslations()
  const offset = search.offset ?? 0
  const query = search.q ?? ""
  const state = search.state ?? ALL_STATES
  const page = useQuery(
    adminUsersQueryOptions({
      limit: ADMIN_PAGE_SIZE,
      offset,
      ...(query === "" ? {} : { q: query }),
      ...(state === ALL_STATES ? {} : { state }),
    })
  )

  return (
    <AsyncDataTable
      columns={adminUserColumns(t)}
      data={page.data?.data ?? []}
      emptyIcon={UsersRound}
      emptyTitle={t("admin.users.empty")}
      filters={
        <div className="flex flex-col gap-2">
          <Label htmlFor="admin-users-state">
            {t("admin.users.stateFilter")}
          </Label>
          <Select
            className="w-[200px]"
            id="admin-users-state"
            items={[
              { value: ALL_STATES, label: t("admin.users.allStates") },
              ...ACCOUNT_STATES.map((candidate) => ({
                value: candidate,
                label: t(accountLook(candidate).label),
              })),
            ]}
            onValueChange={(next) => {
              setSearch({ state: next })
            }}
            value={state}
          />
        </div>
      }
      isError={page.isError}
      isFetching={page.isFetching}
      isPending={page.isPending}
      limit={ADMIN_PAGE_SIZE}
      offset={offset}
      onOffsetChange={(next) => {
        setSearch({ offset: next })
      }}
      refetch={() => {
        page.refetch()
      }}
      rowKey={(user) => user.id}
      rowLabel={(user) => user.email}
      rowLink={(user) => ({
        to: "/dashboard/admin/users/$id",
        params: { id: user.id },
      })}
      search={{
        id: "admin-users-search",
        value: query,
        placeholder: t("admin.users.searchPlaceholder"),
        onChange: (next) => {
          setSearch({ q: next })
        },
      }}
      title={t("admin.users.title")}
      total={page.data?.total ?? 0}
    />
  )
}
