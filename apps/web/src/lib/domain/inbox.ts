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

// Only catches up a socket that died silently; the socket carries the news.
export const INBOX_POLL_INTERVAL_MS = 60_000

export const DRAFT_SAVE_DELAY_MS = 800

export const THREAD_FOLD_THRESHOLD = 5

export const INBOX_STATUS = "open"

export const MAILBOX_EVERY = ""

export const MAILBOX_OTHERS = "others"

export const MAILBOX_AUTOMATED = "automated"

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

// A selection is taken or refused as a whole.
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

const INITIAL_RE = /[^\p{L}\p{N}]+/u

export function initialsOf({ email, name }: Correspondent): string {
  const source = name?.trim() ? name : email.split("@")[0]
  const words = source.split(INITIAL_RE).filter((word) => word !== "")

  if (words.length === 0) {
    return "?"
  }

  const letters =
    words.length === 1 ? words[0].slice(0, 2) : `${words[0][0]}${words[1][0]}`

  return letters.toUpperCase()
}

export interface InboxShortcut {
  // Translated: key names differ between keyboard languages.
  keys: DictionaryKey
  label: DictionaryKey
}

export const INBOX_SHORTCUTS = {
  next: { keys: "inbox.keysNext", label: "inbox.shortcutNext" },
  previous: { keys: "inbox.keysPrevious", label: "inbox.shortcutPrevious" },
  open: { keys: "inbox.keysOpen", label: "inbox.shortcutOpen" },
  close: { keys: "inbox.keysClose", label: "inbox.shortcutClose" },
  unread: { keys: "inbox.keysUnread", label: "inbox.shortcutUnread" },
  reply: { keys: "inbox.keysReply", label: "inbox.shortcutReply" },
  select: { keys: "inbox.keysSelect", label: "inbox.shortcutSelect" },
  escape: { keys: "inbox.keysEscape", label: "inbox.shortcutEscape" },
  help: { keys: "inbox.keysHelp", label: "inbox.shortcutHelp" },
} as const satisfies Record<string, InboxShortcut>

export function shortcutTitle(t: Translate, shortcut: InboxShortcut): string {
  return t("inbox.shortcutTitle", {
    action: t(shortcut.label),
    keys: t(shortcut.keys),
  })
}

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"])

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return TYPING_TAGS.has(target.tagName) || target.isContentEditable
}
