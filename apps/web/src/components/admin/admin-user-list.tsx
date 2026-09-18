import { ADMIN_PAGE_SIZE } from "@pupitre/shared/platform"
import { useQuery } from "@tanstack/react-query"
import { UsersRound } from "lucide-react"
import { useState } from "react"
import { AdminFailure } from "@/components/admin/admin-failure"
import { AdminSearchForm } from "@/components/admin/admin-search-form"
import { AdminUserRow } from "@/components/admin/admin-user-row"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Pagination } from "@/components/ui/pagination"
import { SkeletonRows } from "@/components/ui/skeleton"
import { useTranslations } from "@/hooks/use-locale"
import { adminUsersQueryOptions } from "@/lib/api/admin-queries"

export function AdminUserList() {
  const t = useTranslations()
  const [query, setQuery] = useState("")
  const [offset, setOffset] = useState(0)
  const page = useQuery(
    adminUsersQueryOptions({
      limit: ADMIN_PAGE_SIZE,
      offset,
      ...(query === "" ? {} : { q: query }),
    })
  )

  function searchFor(next: string) {
    setQuery(next)
    setOffset(0)
  }

  return (
    <div className="flex flex-col gap-gutter">
      <AdminSearchForm
        id="admin-users-search"
        onSearch={searchFor}
        placeholder={t("admin.users.searchPlaceholder")}
        query={query}
      />

      {page.isPending ? <SkeletonRows label={t("admin.reading")} /> : null}

      {page.isError ? (
        <AdminFailure
          fetching={page.isFetching}
          onRetry={() => {
            page.refetch()
          }}
        />
      ) : null}

      {page.isSuccess && page.data.total === 0 ? (
        <EmptyState icon={UsersRound} title={t("admin.users.empty")} />
      ) : null}

      {page.isSuccess && page.data.total > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.users.title")}</CardTitle>
            <span className="font-data text-[12px] text-ink-3 tabular-nums">
              {t("admin.range", {
                from: offset + 1,
                to: offset + page.data.data.length,
                total: page.data.total,
              })}
            </span>
          </CardHeader>

          <ul aria-busy={page.isFetching || undefined}>
            {page.data.data.map((user) => (
              <AdminUserRow key={user.id} user={user} />
            ))}
          </ul>
        </Card>
      ) : null}

      {page.isSuccess ? (
        <Pagination
          nextLabel={t("admin.next")}
          offset={offset}
          onOffsetChange={setOffset}
          pageSize={ADMIN_PAGE_SIZE}
          previousLabel={t("admin.previous")}
          total={page.data.total}
        />
      ) : null}
    </div>
  )
}
