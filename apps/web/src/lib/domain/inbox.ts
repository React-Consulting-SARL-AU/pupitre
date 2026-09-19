import {
  isBlockedAttachment,
  isPreviewableMailType,
  MAIL_MAX_OUTBOUND_ATTACHMENT_BYTES,
  MAIL_MAX_OUTBOUND_ATTACHMENTS,
} from "@pupitre/shared/legal"
import { API_PREFIX } from "@/lib/config/urls"
import type { StatusLook } from "@/lib/domain/server-status"
import type { DictionaryKey } from "@/lib/i18n/en"
import type { Translate } from "@/lib/i18n/i18n"

export const INBOX_PAGE_SIZE = 25

export const INBOX_POLL_INTERVAL_MS = 30_000

export const ASSIGNED_ANYONE = ""

export const ASSIGNED_ME = "me"

export const ASSIGNED_NOBODY = "none"

const OPEN: StatusLook = {
  shape: "hollow",
  tone: "muted",
  label: "inbox.statusOpen",
}

const CLOSED: StatusLook = {
  shape: "filled",
  tone: "muted",
  label: "inbox.statusClosed",
}

export function threadStatusLook(status: string): StatusLook {
  return status === "closed" ? CLOSED : OPEN
}

export interface ThreadActivity {
  last_inbound_at: string | null
  last_outbound_at: string | null
  updated_at: string
}

export interface ActivityLabel {
  key: DictionaryKey
  at: string
}

function moment(value: string): number {
  return new Date(value).getTime()
}

/** The last thing that happened to a conversation, named for what it was. */
export function lastActivity({
  last_inbound_at,
  last_outbound_at,
  updated_at,
}: ThreadActivity): ActivityLabel {
  if (
    last_inbound_at &&
    (!last_outbound_at || moment(last_inbound_at) >= moment(last_outbound_at))
  ) {
    return { key: "inbox.receivedAgo", at: last_inbound_at }
  }

  if (last_outbound_at) {
    return { key: "inbox.sentAgo", at: last_outbound_at }
  }

  return { key: "inbox.changedAgo", at: updated_at }
}

export interface MessageParticipants {
  to: string[]
  cc: string[]
}

/** Who an email went to, and who was kept in copy; empty when it went nowhere named. */
export function participantsLine(
  { to, cc }: MessageParticipants,
  t: Translate
): string {
  const parts: string[] = []

  if (to.length > 0) {
    parts.push(t("inbox.toLine", { to: to.join(", ") }))
  }

  if (cc.length > 0) {
    parts.push(t("inbox.ccLine", { cc: cc.join(", ") }))
  }

  return parts.join(" · ")
}

export interface Correspondent {
  email: string
  name?: string | null
}

export function correspondentLabel({ email, name }: Correspondent): string {
  return name && name.trim() !== "" ? name : email
}

export function messageHtmlUrl(messageId: string): string {
  return `${API_PREFIX}/admin/inbox/messages/${messageId}/html`
}

export interface AttachmentBudget {
  total: number
  over: boolean
  blocked: string[]
}

/** A selection is taken whole or refused whole: the total, the count and every blocked name. */
export function attachmentBudget(files: readonly File[]): AttachmentBudget {
  const total = files.reduce((sum, file) => sum + file.size, 0)

  return {
    total,
    over:
      total > MAIL_MAX_OUTBOUND_ATTACHMENT_BYTES ||
      files.length > MAIL_MAX_OUTBOUND_ATTACHMENTS,
    blocked: files
      .filter((file) => isBlockedAttachment(file.name))
      .map((file) => file.name),
  }
}

export function canPreview(mimeType: string): boolean {
  return isPreviewableMailType(mimeType)
}
