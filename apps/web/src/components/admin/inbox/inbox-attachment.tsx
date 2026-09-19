import { Download, Eye, Paperclip, X } from "lucide-react"
import { useState } from "react"
import {
  type InboxAttachmentData,
  InboxAttachmentViewer,
} from "@/components/admin/inbox/inbox-attachment-viewer"
import { Button } from "@/components/ui/button"
import { useAttachmentDownload } from "@/hooks/use-attachment-download"
import { useTranslations } from "@/hooks/use-locale"
import { canPreview } from "@/lib/domain/inbox"
import { formatBytes } from "@/lib/utils/format"

export interface InboxAttachmentProps {
  attachment: InboxAttachmentData
}

export function InboxAttachment({ attachment }: InboxAttachmentProps) {
  const t = useTranslations()
  const [viewing, setViewing] = useState(false)
  const { phase, download } = useAttachmentDownload(attachment.id)
  const name = attachment.filename
  const previewable = canPreview(attachment.mime_type)
  const viewLabel = t("inbox.viewAttachment", { name })
  const downloadLabel =
    phase === "failed"
      ? t("inbox.downloadFailed", { name })
      : t("inbox.downloadAttachment", { name })

  return (
    <div
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line-strong py-0.5 pr-0.5 pl-3 text-[12px] text-ink-2"
      data-attachment={attachment.id}
    >
      <Paperclip
        aria-hidden="true"
        className="size-3.5 shrink-0"
        strokeWidth={1.5}
      />
      <span className="truncate">{name}</span>
      <span className="shrink-0 font-data text-ink-3 tabular-nums">
        {formatBytes(attachment.size, t)}
      </span>

      {previewable ? (
        <Button
          aria-label={viewLabel}
          className="w-7 px-0"
          icon={Eye}
          onClick={() => {
            setViewing(true)
          }}
          size="sm"
          title={viewLabel}
          variant="ghost"
        />
      ) : null}

      <Button
        aria-label={downloadLabel}
        className="w-7 px-0"
        icon={phase === "failed" ? X : Download}
        loading={phase === "pending"}
        onClick={() => {
          download()
        }}
        size="sm"
        title={downloadLabel}
        variant="ghost"
      />

      {previewable ? (
        <InboxAttachmentViewer
          attachment={attachment}
          onOpenChange={setViewing}
          open={viewing}
        />
      ) : null}
    </div>
  )
}
