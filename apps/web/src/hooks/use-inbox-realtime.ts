import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import { inboxKeys } from "@/lib/api/inbox-queries"
import { API_PREFIX } from "@/lib/config/urls"

export const INBOX_EVENTS_PATH = `${API_PREFIX}/admin/inbox/events`

const FIRST_RETRY_MS = 1000

/** Past this the socket stops trying harder; the list's poll carries the news. */
const MAX_RETRY_MS = 30_000

export interface InboxRealtimeEvent {
  type: string
  thread_id?: string
  mailbox_id?: string | null
}

const HTTP_SCHEME_RE = /^http/

export function inboxSocketUrl(origin: string): string {
  return `${origin.replace(HTTP_SCHEME_RE, "ws")}${INBOX_EVENTS_PATH}`
}

type SocketFactory = (url: string) => WebSocket

export interface InboxRealtimeOptions {
  /** A fake socket in a test; the browser's own otherwise. */
  socketFactory?: SocketFactory
  origin?: string
}

/**
 * One socket for the whole inbox, opened by its layout. A frame only says
 * what changed; the queries it names are the ones refetched.
 */
export function useInboxRealtime({
  socketFactory,
  origin,
}: InboxRealtimeOptions = {}): void {
  const queryClient = useQueryClient()
  const factory = useRef(socketFactory)
  const address = useRef(origin)

  factory.current = socketFactory
  address.current = origin

  useEffect(() => {
    const open = factory.current ?? ((url: string) => new WebSocket(url))
    const url = inboxSocketUrl(
      address.current ?? globalThis.location?.origin ?? ""
    )

    let socket: WebSocket | null = null
    let retry = FIRST_RETRY_MS
    let timer: ReturnType<typeof setTimeout> | null = null
    let closed = false

    function invalidate(event: InboxRealtimeEvent) {
      queryClient.invalidateQueries({ queryKey: inboxKeys.allThreads })
      queryClient.invalidateQueries({ queryKey: inboxKeys.counts })
      queryClient.invalidateQueries({ queryKey: inboxKeys.mailboxes })

      if (event.thread_id) {
        queryClient.invalidateQueries({
          queryKey: inboxKeys.thread(event.thread_id),
        })
      }
    }

    function connect() {
      if (closed) {
        return
      }

      socket = open(url)

      socket.onopen = () => {
        retry = FIRST_RETRY_MS
      }

      socket.onmessage = (frame: MessageEvent) => {
        if (typeof frame.data !== "string") {
          return
        }

        try {
          invalidate(JSON.parse(frame.data) as InboxRealtimeEvent)
        } catch {
          return
        }
      }

      socket.onclose = () => {
        if (closed) {
          return
        }

        timer = setTimeout(connect, retry)
        retry = Math.min(retry * 2, MAX_RETRY_MS)
      }
    }

    connect()

    return () => {
      closed = true

      if (timer) {
        clearTimeout(timer)
      }

      socket?.close()
    }
  }, [queryClient])
}
