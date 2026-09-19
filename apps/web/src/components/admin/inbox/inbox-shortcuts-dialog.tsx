import { Keyboard } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DialogClose,
  DialogPopup,
  DialogRoot,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { useTranslations } from "@/hooks/use-locale"
import { INBOX_SHORTCUTS } from "@/lib/domain/inbox"

export interface InboxShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InboxShortcutsDialog({
  open,
  onOpenChange,
}: InboxShortcutsDialogProps) {
  const t = useTranslations()

  return (
    <DialogRoot onOpenChange={onOpenChange} open={open}>
      <DialogTrigger
        render={
          <Button
            aria-label={t("inbox.shortcuts")}
            className="w-9 px-0"
            icon={Keyboard}
            title={t("inbox.shortcuts")}
          />
        }
      />
      <DialogPopup title={t("inbox.shortcutsTitle")}>
        <dl className="mt-gutter flex flex-col gap-2">
          {INBOX_SHORTCUTS.map((shortcut) => (
            <div
              className="flex items-center justify-between gap-4"
              key={shortcut.label}
            >
              <dt className="text-[13px] text-ink-2">{t(shortcut.label)}</dt>
              <dd>
                <Kbd>{t(shortcut.keys)}</Kbd>
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex justify-end">
          <DialogClose
            render={<Button variant="ghost">{t("common.close")}</Button>}
          />
        </div>
      </DialogPopup>
    </DialogRoot>
  )
}
