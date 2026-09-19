import { useEffect, useRef } from "react"
import { isTypingTarget } from "@/lib/domain/inbox"

export interface InboxShortcutHandlers {
  next: () => void
  previous: () => void
  open: () => void
  toggleClosed: () => void
  markUnread: () => void
  toggleSelected: () => void
  escape: () => void
  help: () => void
}

const REPLY_FIELD_ID = "inbox-reply"

/** The one registrar of the inbox: the layout mounts it, nothing else listens. */
export function useInboxShortcuts(handlers: InboxShortcutHandlers): void {
  const current = useRef(handlers)

  current.current = handlers

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || isTypingTarget(event.target)) {
        return
      }

      const acts: Record<string, (() => void) | undefined> = {
        j: current.current.next,
        k: current.current.previous,
        Enter: current.current.open,
        o: current.current.open,
        e: current.current.toggleClosed,
        u: current.current.markUnread,
        x: current.current.toggleSelected,
        Escape: current.current.escape,
        "?": current.current.help,
        r: () => {
          document.getElementById(REPLY_FIELD_ID)?.focus()
        },
      }
      const act = acts[event.key]

      if (!act) {
        return
      }

      event.preventDefault()
      act()
    }

    window.addEventListener("keydown", onKeyDown)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [])
}
