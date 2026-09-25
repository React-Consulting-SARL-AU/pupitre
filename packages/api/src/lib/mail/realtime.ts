export const INBOX_EVENT_TYPES = [
  "thread.received",
  "thread.updated",
  "draft.changed",
  "message.sent",
  "message.failed",
  "counts.changed",
  "access.revoked",
] as const

export type InboxEventType = (typeof INBOX_EVENT_TYPES)[number]

export interface InboxEvent {
  type: InboxEventType
  thread_id?: string
  mailbox_id?: string | null
  /** On `access.revoked`: whose open sockets the room closes instead of broadcasting. */
  user_id?: string
}

export type InboxEventPublisher = (event: InboxEvent) => void | Promise<void>

let publisher: InboxEventPublisher | null = null

export function configureInboxRealtime(next: InboxEventPublisher): void {
  publisher = next
}

export function resetInboxRealtime(): void {
  publisher = null
}

/**
 * A broadcast that fails never fails the write that caused it: the console
 * falls back on its poll, and a lost frame costs a refresh, not an answer.
 */
export async function publishInboxEvent(event: InboxEvent): Promise<void> {
  if (!publisher) {
    return
  }

  try {
    await publisher(event)
  } catch {
    return
  }
}
