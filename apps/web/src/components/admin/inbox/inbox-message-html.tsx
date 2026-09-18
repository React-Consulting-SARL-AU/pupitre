import { Eye, EyeOff } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useTranslations } from "@/hooks/use-locale"
import { messageHtmlUrl } from "@/lib/domain/inbox"

export interface InboxMessageHtmlProps {
  messageId: string
}

export function InboxMessageHtml({ messageId }: InboxMessageHtmlProps) {
  const t = useTranslations()
  const [shown, setShown] = useState(false)

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        icon={shown ? EyeOff : Eye}
        onClick={() => {
          setShown(!shown)
        }}
        size="sm"
      >
        {shown ? t("inbox.hideHtml") : t("inbox.showHtml")}
      </Button>

      {shown ? (
        // The frame is fully sandboxed, so its document cannot be measured from
        // here: it keeps a fixed height and scrolls inside.
        <iframe
          className="h-[480px] w-full rounded-md border border-line bg-surface"
          referrerPolicy="no-referrer"
          sandbox=""
          src={messageHtmlUrl(messageId)}
          title={t("inbox.htmlFrame")}
        />
      ) : null}
    </div>
  )
}
