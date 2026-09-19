import {
  MAIL_MAX_OUTBOUND_ATTACHMENT_BYTES,
  MAIL_MAX_OUTBOUND_ATTACHMENTS,
} from "@pupitre/shared/legal"
import { Paperclip, X } from "lucide-react"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field-error"
import { Spinner } from "@/components/ui/spinner"
import { useTranslations } from "@/hooks/use-locale"
import { attachmentBudget } from "@/lib/domain/inbox"
import { formatBytes } from "@/lib/utils/format"

export interface InboxAttachmentPickerProps {
  id: string
  files: File[]
  onFilesChange: (files: File[]) => void
  disabled?: boolean
  /** The file leaving right now: its row breathes instead of offering to go. */
  sending?: string | null
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}

export function InboxAttachmentPicker({
  id,
  files,
  onFilesChange,
  disabled = false,
  sending = null,
}: InboxAttachmentPickerProps) {
  const t = useTranslations()
  const input = useRef<HTMLInputElement>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const max = formatBytes(MAIL_MAX_OUTBOUND_ATTACHMENT_BYTES, t)

  function add(chosen: FileList | null): void {
    if (!chosen || chosen.length === 0) {
      return
    }

    const known = new Set(files.map(fileKey))
    const next = [
      ...files,
      ...Array.from(chosen).filter((file) => !known.has(fileKey(file))),
    ]
    const budget = attachmentBudget(next)

    if (budget.blocked.length > 0) {
      setRefusal(
        t("inbox.attachmentBlocked", { name: budget.blocked.join(", ") })
      )

      return
    }

    if (budget.over) {
      setRefusal(
        t("inbox.attachmentsOverBudget", {
          count: MAIL_MAX_OUTBOUND_ATTACHMENTS,
          max,
        })
      )

      return
    }

    setRefusal(null)
    onFilesChange(next)
  }

  function remove(index: number): void {
    setRefusal(null)
    onFilesChange(files.filter((_, at) => at !== index))
  }

  return (
    <div className="flex flex-col gap-2">
      {files.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {files.map((file, index) => (
            <li
              className="flex items-center justify-between gap-2 rounded-md border border-line bg-sunken py-1 pr-1 pl-3 text-[12px]"
              key={fileKey(file)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Paperclip
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-ink-3"
                  strokeWidth={1.5}
                />
                <span className="truncate text-ink">{file.name}</span>
                <span className="shrink-0 font-data text-ink-3 tabular-nums">
                  {formatBytes(file.size, t)}
                </span>
              </span>

              {sending === file.name ? (
                <Spinner label={t("inbox.uploading", { name: file.name })} />
              ) : (
                <Button
                  aria-label={t("inbox.removeAttachment", { name: file.name })}
                  className="w-7 px-0"
                  disabled={disabled}
                  icon={X}
                  onClick={() => {
                    remove(index)
                  }}
                  size="sm"
                  title={t("inbox.removeAttachment", { name: file.name })}
                  variant="ghost"
                />
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <input
          className="sr-only"
          disabled={disabled}
          id={id}
          multiple
          onChange={(event) => {
            add(event.target.files)
            event.target.value = ""
          }}
          ref={input}
          tabIndex={-1}
          type="file"
        />
        <Button
          disabled={disabled}
          icon={Paperclip}
          onClick={() => {
            input.current?.click()
          }}
          size="sm"
        >
          {t("inbox.attach")}
        </Button>

        {files.length > 0 ? (
          <span className="font-data text-[12px] text-ink-3 tabular-nums">
            {t("inbox.attachmentTotal", {
              total: formatBytes(attachmentBudget(files).total, t),
              max,
            })}
          </span>
        ) : null}
      </div>

      <FieldError>{refusal}</FieldError>
    </div>
  )
}
