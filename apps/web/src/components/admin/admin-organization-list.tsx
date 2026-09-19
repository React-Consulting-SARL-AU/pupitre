import { ADMIN_PAGE_SIZE } from "@pupitre/shared/platform"
import { useQuery } from "@tanstack/react-query"
import { Building2 } from "lucide-react"
import { adminOrganizationColumns } from "@/components/admin/admin-organization-columns"
import { AsyncDataTable } from "@/components/ui/async-data-table"
import { useTranslations } from "@/hooks/use-locale"
import { adminOrganizationsQueryOptions } from "@/lib/api/admin-queries"
import type { ListSearchHandle } from "@/lib/domain/list-search"

export interface AdminOrganizationListSearch {
  q?: string
  offset?: number
}

export type AdminOrganizationListProps =
  ListSearchHandle<AdminOrganizationListSearch>

export function AdminOrganizationList({
  search,
  setSearch,
}: AdminOrganizationListProps) {
  const t = useTranslations()
  const offset = search.offset ?? 0
  const query = search.q ?? ""
  const page = useQuery(
    adminOrganizationsQueryOptions({
      limit: ADMIN_PAGE_SIZE,
      offset,
      ...(query === "" ? {} : { q: query }),
    })
  )

  return (
    <AsyncDataTable
      columns={adminOrganizationColumns(t)}
      data={page.data?.data ?? []}
      emptyIcon={Building2}
      emptyTitle={t("admin.organizations.empty")}
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
      rowKey={(organization) => organization.id}
      rowLabel={(organization) => organization.name}
      rowLink={(organization) => ({
        to: "/dashboard/admin/organizations/$id",
        params: { id: organization.id },
      })}
      search={{
        id: "admin-organizations-search",
        value: query,
        placeholder: t("admin.organizations.searchPlaceholder"),
        onChange: (next) => {
          setSearch({ q: next })
        },
      }}
      title={t("admin.organizations.title")}
      total={page.data?.total ?? 0}
    />
  )
}
