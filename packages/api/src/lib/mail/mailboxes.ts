import { LEGAL_CONTACTS, mailboxAddressOf } from "@pupitre/shared/legal"
import {
  isPlatformMailboxId,
  PLATFORM_MAILBOX_IDS,
} from "@pupitre/shared/platform"
import { getPrisma } from "../api/prisma"
import { type Actor, recordEvent } from "../audit/audit"
import { publishInboxEvent } from "./realtime"

export interface MailboxSeed {
  id: string
  address: string
  displayName: string
  sensitive: boolean
  sortOrder: number
}

/** Mirrors the migration's seed, for a database emptied between tests. */
export const PLATFORM_MAILBOXES: readonly MailboxSeed[] = [
  {
    id: PLATFORM_MAILBOX_IDS.support,
    address: LEGAL_CONTACTS.support,
    displayName: "Support",
    sensitive: false,
    sortOrder: 0,
  },
  {
    id: PLATFORM_MAILBOX_IDS.legal,
    address: LEGAL_CONTACTS.legal,
    displayName: "Juridique",
    sensitive: true,
    sortOrder: 1,
  },
  {
    id: PLATFORM_MAILBOX_IDS.privacy,
    address: LEGAL_CONTACTS.privacy,
    displayName: "Données personnelles",
    sensitive: true,
    sortOrder: 2,
  },
  {
    id: PLATFORM_MAILBOX_IDS.security,
    address: LEGAL_CONTACTS.security,
    displayName: "Sécurité",
    sensitive: true,
    sortOrder: 3,
  },
]

export interface MailboxView {
  id: string
  address: string
  display_name: string
  signature: string | null
  sensitive: boolean
  can_reply: boolean
  enabled: boolean
  sort_order: number
  threads: number
  unread: number
}

export interface MailboxCounts {
  mailboxes: { id: string; unread: number; open: number }[]
  /** `threads` too: the Others entry shows as soon as one thread lands there, closed or not. */
  others: { unread: number; open: number; threads: number }
  total_unread: number
}

export interface MailboxInput {
  address: string
  display_name: string
  signature?: string | null
  sensitive?: boolean
  can_reply?: boolean
}

export interface MailboxPatch {
  display_name?: string
  signature?: string | null
  sensitive?: boolean
  can_reply?: boolean
  enabled?: boolean
  sort_order?: number
}

export class MailboxAddressRefusedError extends Error {
  readonly address: string

  constructor(address: string) {
    super(`${address} is not an address of the platform domain`)
    this.name = "MailboxAddressRefusedError"
    this.address = address
  }
}

export class MailboxTakenError extends Error {
  readonly address: string

  constructor(address: string) {
    super(`${address} already has a mailbox`)
    this.name = "MailboxTakenError"
    this.address = address
  }
}

export class MailboxInUseError extends Error {
  readonly threads: number

  constructor(threads: number) {
    super(`${threads} threads still hang from this mailbox`)
    this.name = "MailboxInUseError"
    this.threads = threads
  }
}

export class MailboxProtectedError extends Error {
  readonly mailboxId: string

  constructor(mailboxId: string) {
    super(`${mailboxId} is one of the legal mailboxes`)
    this.name = "MailboxProtectedError"
    this.mailboxId = mailboxId
  }
}

interface MailboxRow {
  id: string
  address: string
  displayName: string
  signature: string | null
  sensitive: boolean
  canReply: boolean
  enabled: boolean
  sortOrder: number
}

function viewOf(
  mailbox: MailboxRow,
  threads: number,
  unread: number
): MailboxView {
  return {
    id: mailbox.id,
    address: mailbox.address,
    display_name: mailbox.displayName,
    signature: mailbox.signature,
    sensitive: mailbox.sensitive,
    can_reply: mailbox.canReply,
    enabled: mailbox.enabled,
    sort_order: mailbox.sortOrder,
    threads,
    unread,
  }
}

async function countsByMailbox(): Promise<{
  threads: Map<string, number>
  unread: Map<string, number>
}> {
  const prisma = getPrisma()
  const [all, unread] = await Promise.all([
    prisma.mailThread.groupBy({ by: ["mailboxId"], _count: { _all: true } }),
    prisma.mailThread.groupBy({
      by: ["mailboxId"],
      where: { unread: true },
      _count: { _all: true },
    }),
  ])

  return {
    threads: new Map(
      all.map((row) => [row.mailboxId ?? "", row._count._all] as const)
    ),
    unread: new Map(
      unread.map((row) => [row.mailboxId ?? "", row._count._all] as const)
    ),
  }
}

export async function listMailboxes(): Promise<MailboxView[]> {
  const mailboxes = await getPrisma().mailMailbox.findMany({
    orderBy: [{ sortOrder: "asc" }, { address: "asc" }],
  })
  const counts = await countsByMailbox()

  return mailboxes.map((mailbox) =>
    viewOf(
      mailbox,
      counts.threads.get(mailbox.id) ?? 0,
      counts.unread.get(mailbox.id) ?? 0
    )
  )
}

export async function readMailbox(
  mailboxId: string
): Promise<MailboxView | null> {
  const mailbox = await getPrisma().mailMailbox.findUnique({
    where: { id: mailboxId },
  })

  if (!mailbox) {
    return null
  }

  const counts = await countsByMailbox()

  return viewOf(
    mailbox,
    counts.threads.get(mailbox.id) ?? 0,
    counts.unread.get(mailbox.id) ?? 0
  )
}

export async function mailboxIdForAddress(
  address: string
): Promise<string | null> {
  const mailbox = await getPrisma().mailMailbox.findUnique({
    where: { address: address.trim().toLowerCase() },
    select: { id: true },
  })

  return mailbox?.id ?? null
}

export async function countMailboxes(): Promise<MailboxCounts> {
  const prisma = getPrisma()
  const [mailboxes, unread, open, others] = await Promise.all([
    prisma.mailMailbox.findMany({
      orderBy: [{ sortOrder: "asc" }, { address: "asc" }],
      select: { id: true },
    }),
    prisma.mailThread.groupBy({
      by: ["mailboxId"],
      where: { unread: true },
      _count: { _all: true },
    }),
    prisma.mailThread.groupBy({
      by: ["mailboxId"],
      where: { status: "open" },
      _count: { _all: true },
    }),
    prisma.mailThread.count({ where: { mailboxId: null } }),
  ])

  const unreadBy = new Map(
    unread.map((row) => [row.mailboxId ?? "", row._count._all] as const)
  )
  const openBy = new Map(
    open.map((row) => [row.mailboxId ?? "", row._count._all] as const)
  )

  return {
    mailboxes: mailboxes.map((mailbox) => ({
      id: mailbox.id,
      unread: unreadBy.get(mailbox.id) ?? 0,
      open: openBy.get(mailbox.id) ?? 0,
    })),
    others: {
      unread: unreadBy.get("") ?? 0,
      open: openBy.get("") ?? 0,
      threads: others,
    },
    total_unread: [...unreadBy.values()].reduce((sum, count) => sum + count, 0),
  }
}

export async function createMailbox(
  actor: Actor,
  input: MailboxInput
): Promise<MailboxView> {
  const address = mailboxAddressOf(input.address)

  if (!address) {
    throw new MailboxAddressRefusedError(input.address)
  }

  const prisma = getPrisma()
  const taken = await prisma.mailMailbox.findUnique({
    where: { address },
    select: { id: true },
  })

  if (taken) {
    throw new MailboxTakenError(address)
  }

  const last = await prisma.mailMailbox.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  })

  const mailbox = await prisma.mailMailbox.create({
    data: {
      address,
      displayName: input.display_name,
      signature: input.signature ?? null,
      sensitive: input.sensitive ?? false,
      canReply: input.can_reply ?? true,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  })

  const attached = await prisma.mailThread.updateMany({
    where: { address, mailboxId: null },
    data: { mailboxId: mailbox.id },
  })

  await recordEvent({
    action: "mail.mailbox_created",
    actorUserId: actor.userId,
    targetType: "mail_mailbox",
    targetId: mailbox.id,
    payload: { address, attached_threads: attached.count },
  })
  await publishInboxEvent({ type: "counts.changed", mailbox_id: mailbox.id })

  return viewOf(mailbox, attached.count, 0)
}

export async function updateMailbox(
  actor: Actor,
  mailboxId: string,
  patch: MailboxPatch
): Promise<MailboxView | null> {
  const prisma = getPrisma()
  const existing = await prisma.mailMailbox.findUnique({
    where: { id: mailboxId },
    select: { id: true },
  })

  if (!existing) {
    return null
  }

  await prisma.mailMailbox.update({
    where: { id: mailboxId },
    data: {
      ...(patch.display_name === undefined
        ? {}
        : { displayName: patch.display_name }),
      ...(patch.signature === undefined ? {} : { signature: patch.signature }),
      ...(patch.sensitive === undefined ? {} : { sensitive: patch.sensitive }),
      ...(patch.can_reply === undefined ? {} : { canReply: patch.can_reply }),
      ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
      ...(patch.sort_order === undefined
        ? {}
        : { sortOrder: patch.sort_order }),
    },
  })

  await recordEvent({
    action: "mail.mailbox_updated",
    actorUserId: actor.userId,
    targetType: "mail_mailbox",
    targetId: mailboxId,
    payload: { ...patch },
  })
  await publishInboxEvent({ type: "counts.changed", mailbox_id: mailboxId })

  return await readMailbox(mailboxId)
}

export async function deleteMailbox(
  actor: Actor,
  mailboxId: string
): Promise<boolean> {
  const prisma = getPrisma()
  const mailbox = await prisma.mailMailbox.findUnique({
    where: { id: mailboxId },
    select: { id: true, address: true },
  })

  if (!mailbox) {
    return false
  }

  if (isPlatformMailboxId(mailboxId)) {
    throw new MailboxProtectedError(mailboxId)
  }

  const threads = await prisma.mailThread.count({ where: { mailboxId } })

  if (threads > 0) {
    throw new MailboxInUseError(threads)
  }

  await prisma.mailMailbox.delete({ where: { id: mailboxId } })
  await recordEvent({
    action: "mail.mailbox_deleted",
    actorUserId: actor.userId,
    targetType: "mail_mailbox",
    targetId: mailboxId,
    payload: { address: mailbox.address },
  })
  await publishInboxEvent({ type: "counts.changed", mailbox_id: mailboxId })

  return true
}

/** The migration seeds these; a database emptied row by row needs them back. */
export async function ensurePlatformMailboxes(): Promise<void> {
  const prisma = getPrisma()

  for (const seed of PLATFORM_MAILBOXES) {
    await prisma.mailMailbox.upsert({
      where: { id: seed.id },
      update: {},
      create: {
        id: seed.id,
        address: seed.address,
        displayName: seed.displayName,
        sensitive: seed.sensitive,
        sortOrder: seed.sortOrder,
      },
    })
  }
}
