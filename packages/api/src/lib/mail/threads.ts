import type { Prisma } from "@pupitre/db/cloudflare/client"
import { getPrisma } from "../api/prisma"
import {
  type MailThreadView,
  peopleNamed,
  THREAD_INCLUDE,
  threadViewOf,
} from "./thread-view"

export const MAIL_PAGE_SIZE = 50

export const MAIL_MAX_PAGE_SIZE = 200

export const MAIL_BULK_MAX = 100

export const MAIL_THREAD_SORTS = [
  "last_activity",
  "last_inbound_at",
  "created_at",
  "subject",
] as const

export type MailThreadSort = (typeof MAIL_THREAD_SORTS)[number]

export type MailSortDirection = "asc" | "desc"

export type MailThreadStatus = "open" | "closed"

/** Filter value for the threads no declared mailbox claims. */
export const MAILBOX_OTHERS = "others"

/** `me`, `none`, or an assignee's user id. */
export type MailAssignedFilter = string

export interface MailThreadFilter {
  viewerId: string
  status?: MailThreadStatus
  unread?: boolean
  q?: string
  address?: string
  mailboxId?: string
  organizationId?: string
  automated?: boolean
  assigned?: MailAssignedFilter
  sort?: MailThreadSort
  direction?: MailSortDirection
  limit: number
  offset: number
}

export interface MailThreadPage {
  data: MailThreadView[]
  total: number
  unread: number
}

function assignedWhere(
  assigned: MailAssignedFilter | undefined,
  viewerId: string
): Prisma.MailThreadWhereInput {
  if (!assigned) {
    return {}
  }

  if (assigned === "none") {
    return { assignedUserId: null }
  }

  return { assignedUserId: assigned === "me" ? viewerId : assigned }
}

function mailboxWhere(
  mailboxId: string | undefined
): Prisma.MailThreadWhereInput {
  if (!mailboxId) {
    return {}
  }

  return mailboxId === MAILBOX_OTHERS ? { mailboxId: null } : { mailboxId }
}

const SEARCH_WILDCARDS_RE = /[%_]/g

const NOTHING: Prisma.MailThreadWhereInput = { id: { in: [] } }

// `contains` becomes an unescaped `LIKE`, so `%` and `_` are stripped rather than matching everything.
function searchWhere(q: string): Prisma.MailThreadWhereInput {
  const literal = q.replace(SEARCH_WILDCARDS_RE, "")

  if (literal === "") {
    return NOTHING
  }

  return {
    OR: [
      { id: { contains: literal } },
      { subject: { contains: literal } },
      {
        messages: {
          some: {
            OR: [
              { fromEmail: { contains: literal } },
              { fromName: { contains: literal } },
              { text: { contains: literal } },
            ],
          },
        },
      },
    ],
  }
}

function whereOf(
  filter: MailThreadFilter,
  withUnread: boolean
): Prisma.MailThreadWhereInput {
  const q = filter.q?.trim()

  return {
    ...(filter.status ? { status: filter.status } : {}),
    ...(withUnread && filter.unread !== undefined
      ? { unread: filter.unread }
      : {}),
    ...(filter.address ? { address: filter.address.toLowerCase() } : {}),
    ...mailboxWhere(filter.mailboxId),
    ...(filter.organizationId
      ? { linkedOrganizationId: filter.organizationId }
      : {}),
    lastInboundAutomated: filter.automated ?? false,
    ...assignedWhere(filter.assigned, filter.viewerId),
    ...(q ? searchWhere(q) : {}),
  }
}

const SORT_COLUMNS: Record<MailThreadSort, string> = {
  last_activity: "updatedAt",
  last_inbound_at: "lastInboundAt",
  created_at: "createdAt",
  subject: "subject",
}

function orderOf(
  filter: MailThreadFilter
): Prisma.MailThreadOrderByWithRelationInput {
  const column = SORT_COLUMNS[filter.sort ?? "last_activity"]

  return { [column]: filter.direction ?? "desc" }
}

/** Reads thread rows alone: sender, snippet and counts are denormalised on them. */
export async function listMailThreads(
  filter: MailThreadFilter
): Promise<MailThreadPage> {
  const prisma = getPrisma()
  const where = whereOf(filter, true)

  const [threads, total, unread] = await Promise.all([
    prisma.mailThread.findMany({
      where,
      include: THREAD_INCLUDE,
      orderBy: orderOf(filter),
      take: filter.limit,
      skip: filter.offset,
    }),
    prisma.mailThread.count({ where }),
    prisma.mailThread.count({
      where: { ...whereOf(filter, false), unread: true },
    }),
  ])

  const people = await peopleNamed(
    threads.flatMap((thread) => [thread.assignedUserId, thread.contactUserId])
  )

  return {
    data: threads.map((thread) => threadViewOf(thread, people)),
    total,
    unread,
  }
}
