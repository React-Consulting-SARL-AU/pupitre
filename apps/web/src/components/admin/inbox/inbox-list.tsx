import { Inbox } from "lucide-react"
import { AdminFailure } from "@/components/admin/admin-failure"
import { InboxBulkBar } from "@/components/admin/inbox/inbox-bulk-bar"
import { InboxThreadRow } from "@/components/admin/inbox/inbox-thread-row"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { EmptyState } from "@/components/ui/empty-state"
import { Pagination } from "@/components/ui/pagination"
import { SkeletonRows } from "@/components/ui/skeleton"
import { useTranslations } from "@/hooks/use-locale"
import type { InboxMailbox, InboxThread } from "@/lib/api/inbox-queries"
import { INBOX_PAGE_SIZE } from "@/lib/domain/inbox"
import type { InboxSearch } from "@/lib/domain/inbox-search"

export interface InboxListProps {
  threads: InboxThread[]
  total: number
  mailboxes: InboxMailbox[]
  search: InboxSearch
  pending: boolean
  failed: boolean
  fetching: boolean
  onRetry: () => void
  onOffsetChange: (offset: number) => void
  selected: string[]
  onSelectedChange: (selected: string[]) => void
  focusedId: string | null
  openThreadId: string | null
  canAct: boolean
  bulkPending: boolean
  onBulk: (patch: { status?: "open" | "closed"; unread?: boolean }) => void
}

export function InboxList({
  threads,
  total,
  mailboxes,
  search,
  pending,
  failed,
  fetching,
  onRetry,
  onOffsetChange,
  selected,
  onSelectedChange,
  focusedId,
  openThreadId,
  canAct,
  bulkPending,
  onBulk,
}: InboxListProps) {
  const t = useTranslations()
  const offset = search.offset ?? 0
  const allSelected = threads.length > 0 && selected.length === threads.length
  const mailboxOf = (id: string | null) =>
    mailboxes.find((mailbox) => mailbox.id === id)

  return (
    <div className="flex flex-col gap-gutter">
      {pending ? <SkeletonRows label={t("admin.reading")} /> : null}

      {failed ? <AdminFailure fetching={fetching} onRetry={onRetry} /> : null}

      {!(pending || failed) && total === 0 ? (
        <EmptyState icon={Inbox} title={t("inbox.empty")} />
      ) : null}

      {!(pending || failed) && total > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Checkbox
                checked={allSelected}
                indeterminate={selected.length > 0 && !allSelected}
                label={t("inbox.selectAll")}
                onCheckedChange={(next) => {
                  onSelectedChange(
                    next ? threads.map((thread) => thread.id) : []
                  )
                }}
              />
              <CardTitle>{t("inbox.threads")}</CardTitle>
            </div>
            <span className="font-data text-[12px] text-ink-3 tabular-nums">
              {t("admin.range", {
                from: offset + 1,
                to: offset + threads.length,
                total,
              })}
            </span>
          </CardHeader>

          {selected.length > 0 ? (
            <InboxBulkBar
              canAct={canAct}
              count={selected.length}
              onClear={() => {
                onSelectedChange([])
              }}
              onClose={() => {
                onBulk({ status: "closed" })
              }}
              onRead={() => {
                onBulk({ unread: false })
              }}
              onReopen={() => {
                onBulk({ status: "open" })
              }}
              onUnread={() => {
                onBulk({ unread: true })
              }}
              pending={bulkPending}
            />
          ) : null}

          <ul aria-busy={fetching || undefined}>
            {threads.map((thread) => (
              <InboxThreadRow
                focused={thread.id === focusedId}
                key={thread.id}
                mailbox={mailboxOf(thread.mailbox_id)}
                onSelectedChange={(next) => {
                  onSelectedChange(
                    next
                      ? [...selected, thread.id]
                      : selected.filter((id) => id !== thread.id)
                  )
                }}
                open={thread.id === openThreadId}
                search={search}
                selected={selected.includes(thread.id)}
                thread={thread}
              />
            ))}
          </ul>
        </Card>
      ) : null}

      {failed ? null : (
        <Pagination
          nextLabel={t("admin.next")}
          offset={offset}
          onOffsetChange={onOffsetChange}
          pageSize={INBOX_PAGE_SIZE}
          previousLabel={t("admin.previous")}
          total={total}
        />
      )}
    </div>
  )
}
