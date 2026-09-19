import { CheckCheck, FolderCheck, FolderOpen, MailOpen, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTranslations } from "@/hooks/use-locale"

export interface InboxBulkBarProps {
  count: number
  pending: boolean
  canAct: boolean
  onClose: () => void
  onReopen: () => void
  onRead: () => void
  onUnread: () => void
  onClear: () => void
}

export function InboxBulkBar({
  count,
  pending,
  canAct,
  onClose,
  onReopen,
  onRead,
  onUnread,
  onClear,
}: InboxBulkBarProps) {
  const t = useTranslations()

  return (
    <div className="flex flex-wrap items-center gap-2 border-line border-b bg-sunken px-3 py-2">
      <span className="font-data text-[12px] text-ink-2 tabular-nums">
        {t.plural("inbox.selected", count)}
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {canAct ? (
          <>
            <Button
              icon={FolderCheck}
              loading={pending}
              onClick={onClose}
              size="sm"
            >
              {t("inbox.bulkClose")}
            </Button>
            <Button
              icon={FolderOpen}
              loading={pending}
              onClick={onReopen}
              size="sm"
            >
              {t("inbox.bulkReopen")}
            </Button>
          </>
        ) : null}

        <Button icon={CheckCheck} loading={pending} onClick={onRead} size="sm">
          {t("inbox.bulkRead")}
        </Button>
        <Button icon={MailOpen} loading={pending} onClick={onUnread} size="sm">
          {t("inbox.bulkUnread")}
        </Button>
        <Button
          aria-label={t("inbox.clearSelection")}
          className="w-7 px-0"
          icon={X}
          onClick={onClear}
          size="sm"
          title={t("inbox.clearSelection")}
          variant="ghost"
        />
      </div>
    </div>
  )
}
