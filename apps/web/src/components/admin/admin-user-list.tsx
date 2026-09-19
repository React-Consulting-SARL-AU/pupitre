import { ADMIN_PAGE_SIZE } from "@pupitre/shared/platform"
import { useQuery } from "@tanstack/react-query"
import { UsersRound } from "lucide-react"
import { adminUserColumns } from "@/components/admin/admin-user-columns"
import { AsyncDataTable } from "@/components/ui/async-data-table"
import { useTranslations } from "@/hooks/use-locale"
import { adminUsersQueryOptions } from "@/lib/api/admin-queries"
import type { ListSearchHandle } from "@/lib/domain/list-search"

export interface AdminUserListSearch {
  q?: string
  offset?: number
}

export type AdminUserListProps = ListSearchHandle<AdminUserListSearch>

export function AdminUserList({ search, setSearch }: AdminUserListProps) {
  const t = useTranslations()
  const offset = search.offset ?? 0
  const query = search.q ?? ""
  const page = useQuery(
    adminUsersQueryOptions({
      limit: ADMIN_PAGE_SIZE,
      offset,
      ...(query === "" ? {} : { q: query }),
    })
  )

  return (
    <AsyncDataTable
      columns={adminUserColumns(t)}
      data={page.data?.data ?? []}
      emptyIcon={UsersRound}
      emptyTitle={t("admin.users.empty")}
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
