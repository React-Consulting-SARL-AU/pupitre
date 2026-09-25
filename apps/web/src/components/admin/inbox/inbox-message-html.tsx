import { useTranslations } from "@/hooks/use-locale"
import { messageHtmlUrl } from "@/lib/domain/inbox"

export interface InboxMessageHtmlProps {
  messageId: string
}

// An empty `sandbox` gives the frame an opaque origin: nothing runs, and its height cannot be measured.
export function InboxMessageHtml({ messageId }: InboxMessageHtmlProps) {
  const t = useTranslations()

  return (
    <iframe
      className="h-[480px] w-full rounded-md border border-line bg-surface"
      referrerPolicy="no-referrer"
      sandbox=""
      src={messageHtmlUrl(messageId)}
      title={t("inbox.htmlFrame")}
    />
  )
}
