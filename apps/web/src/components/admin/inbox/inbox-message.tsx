import { InboxAttachment } from "@/components/admin/inbox/inbox-attachment"
import { InboxMessageHtml } from "@/components/admin/inbox/inbox-message-html"
import { Callout } from "@/components/ui/callout"
import { useTranslations } from "@/hooks/use-locale"
import type { InboxMessage as InboxMessageData } from "@/lib/api/inbox-queries"
import { correspondentLabel, participantsLine } from "@/lib/domain/inbox"
import { cn } from "@/lib/utils/cn"
import { formatDateTime } from "@/lib/utils/format"

export interface InboxMessageProps {
  message: InboxMessageData
}

export function InboxMessage({ message }: InboxMessageProps) {
  const t = useTranslations()
  const outbound = message.direction === "outbound"
  const at = outbound ? message.sent_at : message.received_at
  const participants = participantsLine(message, t)

  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-md border px-4 py-3",
        outbound
          ? "border-line-strong bg-sunken sm:ml-10"
          : "border-line bg-surface sm:mr-10"
      )}
      data-direction={message.direction}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-[13px] text-ink">
            {correspondentLabel(message.from)}
          </p>
          {participants === "" ? null : (
            <p className="truncate text-[12px] text-ink-3">{participants}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
            {outbound ? t("inbox.messageSent") : t("inbox.messageReceived")}
          </p>
          <p className="text-[12px] text-ink-2">
            {at ? formatDateTime(at, t) : t("format.none")}
          </p>
        </div>
      </header>

      {message.sent_by ? (
        <p className="text-[12px] text-ink-3">
          {t("inbox.sentBy", { name: message.sent_by.name })}
        </p>
      ) : null}

      {message.delivery === "failed" ? (
        <Callout
          fix={message.error}
          title={t("inbox.deliveryFailed")}
          tone="danger"
        />
      ) : null}

      {message.text ? (
        <pre className="whitespace-pre-wrap break-words font-sans text-[13px] text-ink-2">
          {message.text}
        </pre>
      ) : null}

      {message.has_html ? <InboxMessageHtml messageId={message.id} /> : null}

      {message.attachments.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
            {t("inbox.attachments")}
          </p>
          <ul className="flex flex-wrap gap-2">
            {message.attachments.map((attachment) => (
              <li className="min-w-0" key={attachment.id}>
                <InboxAttachment attachment={attachment} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  )
}
