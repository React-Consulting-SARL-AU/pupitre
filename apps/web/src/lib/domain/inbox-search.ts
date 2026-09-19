import type {
  ThreadDirection,
  ThreadSort,
  ThreadStatus,
} from "@/lib/api/inbox-queries"
import {
  type ListFilters,
  type ListSearch,
  listSearch,
} from "@/lib/domain/list-search"

export const INBOX_SORTS: readonly ThreadSort[] = [
  "last_activity",
  "last_inbound_at",
  "created_at",
  "subject",
]

export const INBOX_SORT: ThreadSort = "last_activity"

export const INBOX_DIRECTION: ThreadDirection = "desc"

const THREAD_STATUSES: readonly ThreadStatus[] = ["open", "closed"]

const INBOX_FILTERS = {
  mailbox: { kind: "string" },
  status: { kind: "enum", values: THREAD_STATUSES },
  unread: { kind: "boolean" },
  assigned: { kind: "string" },
  organization_id: { kind: "string" },
  automated: { kind: "boolean" },
} as const satisfies ListFilters

export type InboxSearch = ListSearch<typeof INBOX_FILTERS>

/**
 * The address carries what the reader chose and nothing else: a filter left on
 * its default leaves the address, so a link sent to someone else never freezes
 * today's defaults. The defaults are applied where a value is read.
 */
export const parseInboxSearch = listSearch({
  sortKeys: INBOX_SORTS,
  defaultSort: INBOX_SORT,
  defaultDirection: INBOX_DIRECTION,
  filters: INBOX_FILTERS,
})

export function inboxSort(value: string | undefined): ThreadSort {
  return INBOX_SORTS.find((sort) => sort === value) ?? INBOX_SORT
}
