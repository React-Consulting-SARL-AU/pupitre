import type {
  ThreadDirection,
  ThreadSort,
  ThreadStatus,
} from "@/lib/api/inbox-queries"
import { MAILBOX_EVERY } from "@/lib/domain/inbox"

export interface InboxSearch {
  mailbox: string
  status: ThreadStatus
  unread?: boolean
  assigned: string
  organization_id?: string
  automated?: boolean
  q: string
  sort: ThreadSort
  direction: ThreadDirection
  offset: number
}

const SORTS: ThreadSort[] = [
  "last_activity",
  "last_inbound_at",
  "created_at",
  "subject",
]

function text(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback
}

function flag(value: unknown): boolean | undefined {
  if (value === true || value === "true") {
    return true
  }

  return value === false || value === "false" ? false : undefined
}

function whole(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value)

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

/** The URL is the state: a filter that survives a reload and a link sent to someone else. */
export function parseInboxSearch(search: Record<string, unknown>): InboxSearch {
  const sort = text(search.sort, "last_activity") as ThreadSort
  const organizationId = text(search.organization_id, "")

  return {
    mailbox: text(search.mailbox, MAILBOX_EVERY),
    status: search.status === "closed" ? "closed" : "open",
    unread: flag(search.unread),
    assigned: text(search.assigned, ""),
    ...(organizationId === "" ? {} : { organization_id: organizationId }),
    automated: flag(search.automated),
    q: text(search.q, ""),
    sort: SORTS.includes(sort) ? sort : "last_activity",
    direction: search.direction === "asc" ? "asc" : "desc",
    offset: whole(search.offset),
  }
}
