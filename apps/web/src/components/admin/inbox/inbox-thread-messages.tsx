import { ChevronDown } from "lucide-react"
import { useState } from "react"
import { InboxMessage } from "@/components/admin/inbox/inbox-message"
import { Button } from "@/components/ui/button"
import { useTranslations } from "@/hooks/use-locale"
import type { InboxMessage as InboxMessageData } from "@/lib/api/inbox-queries"
import { THREAD_FOLD_THRESHOLD } from "@/lib/domain/inbox"

export interface InboxThreadMessagesProps {
  messages: InboxMessageData[]
}

export function InboxThreadMessages({ messages }: InboxThreadMessagesProps) {
  const t = useTranslations()
  const [unfolded, setUnfolded] = useState(false)
  const folded =
    unfolded || messages.length <= THREAD_FOLD_THRESHOLD
      ? 0
      : messages.length - THREAD_FOLD_THRESHOLD

  return (
    <div className="flex flex-col gap-3">
      {folded > 0 ? (
        <Button
          icon={ChevronDown}
          onClick={() => {
            setUnfolded(true)
          }}
          size="sm"
        >
          {t.plural("inbox.olderMessages", folded)}
        </Button>
      ) : null}

      {messages.slice(folded).map((message) => (
        <InboxMessage key={message.id} message={message} />
      ))}
    </div>
  )
}
