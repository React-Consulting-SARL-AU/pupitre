import { ChevronDown, ChevronUp } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useTranslations } from "@/hooks/use-locale"
import { splitQuotedBody } from "@/lib/domain/mail-quote"

export interface InboxMessageTextProps {
  text: string
}

export function InboxMessageText({ text }: InboxMessageTextProps) {
  const t = useTranslations()
  const [shown, setShown] = useState(false)
  const { visible, quoted } = splitQuotedBody(text)

  return (
    <div className="flex flex-col items-start gap-2">
      {visible === "" ? null : (
        <pre className="whitespace-pre-wrap break-words font-sans text-[13px] text-ink-2">
          {visible}
        </pre>
      )}

      {quoted ? (
        <>
          <Button
            icon={shown ? ChevronUp : ChevronDown}
            onClick={() => {
              setShown(!shown)
            }}
            size="sm"
            variant="ghost"
          >
            {shown ? t("inbox.hideQuoted") : t("inbox.showQuoted")}
          </Button>

          {shown ? (
            <pre className="whitespace-pre-wrap break-words border-line border-l-2 pl-3 font-sans text-[13px] text-ink-3">
              {quoted}
            </pre>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
