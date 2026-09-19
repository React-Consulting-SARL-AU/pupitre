import { useQuery } from "@tanstack/react-query"
import { Inbox } from "lucide-react"
import { useState } from "react"
import { AdminFailure } from "@/components/admin/admin-failure"
import { InboxComposeDialog } from "@/components/admin/inbox/inbox-compose-dialog"
import { InboxFilterBar } from "@/components/admin/inbox/inbox-filter-bar"
import { InboxThreadRow } from "@/components/admin/inbox/inbox-thread-row"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { Pagination } from "@/components/ui/pagination"
import { SkeletonRows } from "@/components/ui/skeleton"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import {
  inboxAddressesQueryOptions,
  inboxThreadsQueryOptions,
  type ThreadPageQuery,
  type ThreadStatus,
} from "@/lib/api/inbox-queries"
import { canActOnPlatform } from "@/lib/domain/admin"
import { ASSIGNED_ANYONE, INBOX_PAGE_SIZE } from "@/lib/domain/inbox"
import { pageTitle } from "@/lib/domain/page-titles"

export const INBOX_ROUTE_ID = "/dashboard/admin/inbox"

const EVERY_ADDRESS = ""

export function InboxList() {
  const t = useTranslations()
  const { platformRole } = useDashboardContext()
  const { title, parents } = pageTitle(INBOX_ROUTE_ID)
  const [status, setStatus] = useState<ThreadStatus>("open")
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [assigned, setAssigned] = useState(ASSIGNED_ANYONE)
  const [address, setAddress] = useState(EVERY_ADDRESS)
  const [query, setQuery] = useState("")
  const [offset, setOffset] = useState(0)
  const pageQuery: ThreadPageQuery = {
    limit: INBOX_PAGE_SIZE,
    offset,
    status,
    ...(unreadOnly ? { unread: true } : {}),
    ...(assigned === ASSIGNED_ANYONE ? {} : { assigned }),
    ...(address === EVERY_ADDRESS ? {} : { address }),
    ...(query === "" ? {} : { q: query }),
  }
  const page = useQuery(inboxThreadsQueryOptions(pageQuery))
  const addresses = useQuery(inboxAddressesQueryOptions())
  const unread = page.data?.unread ?? 0

  function narrow<T>(set: (value: T) => void) {
    return (value: T) => {
      set(value)
      setOffset(0)
    }
  }

  return (
    <>
      <PageHeader
        actions={
          canActOnPlatform(platformRole) ? (
            <InboxComposeDialog addresses={addresses.data ?? []} />
          ) : null
        }
        description={unread > 0 ? t.plural("inbox.unread", unread) : undefined}
        parents={parents}
        title={t(title)}
      />

      <div className="flex flex-col gap-gutter">
        <InboxFilterBar
          address={address}
          addresses={addresses.data ?? []}
          assigned={assigned}
          onAddressChange={narrow(setAddress)}
          onAssignedChange={narrow(setAssigned)}
          onSearch={narrow(setQuery)}
          onStatusChange={narrow(setStatus)}
          onUnreadOnlyChange={narrow(setUnreadOnly)}
          query={query}
          status={status}
          unreadOnly={unreadOnly}
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
          <EmptyState icon={Inbox} title={t("inbox.empty")} />
        ) : null}

        {page.isSuccess && page.data.total > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("inbox.threads")}</CardTitle>
              <span className="font-data text-[12px] text-ink-3 tabular-nums">
                {t("admin.range", {
                  from: offset + 1,
                  to: offset + page.data.data.length,
                  total: page.data.total,
                })}
              </span>
            </CardHeader>

            <ul aria-busy={page.isFetching || undefined}>
              {page.data.data.map((thread) => (
                <InboxThreadRow key={thread.id} thread={thread} />
              ))}
            </ul>
          </Card>
        ) : null}

        {page.isSuccess ? (
          <Pagination
            nextLabel={t("admin.next")}
            offset={offset}
            onOffsetChange={setOffset}
            pageSize={INBOX_PAGE_SIZE}
            previousLabel={t("admin.previous")}
            total={page.data.total}
          />
        ) : null}
      </div>
    </>
  )
}
