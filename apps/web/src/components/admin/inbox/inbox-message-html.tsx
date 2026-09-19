import { useTranslations } from "@/hooks/use-locale"
import { messageHtmlUrl } from "@/lib/domain/inbox"

export interface InboxMessageHtmlProps {
  messageId: string
}

/**
 * The body is served under its own policy — nothing loads but `data:` — and
 * framed with an empty `sandbox`, so its origin is opaque and nothing runs.
 */
export function InboxMessageHtml({ messageId }: InboxMessageHtmlProps) {
  const t = useTranslations()

  return (
    // The frame is fully sandboxed, so its document cannot be measured from
    // here: it keeps a fixed height and scrolls inside.
    <iframe
      className="h-[480px] w-full rounded-md border border-line bg-surface"
      referrerPolicy="no-referrer"
      sandbox=""
      src={messageHtmlUrl(messageId)}
      title={t("inbox.htmlFrame")}
    />
  )
}
