import { useQuery } from "@tanstack/react-query"
import { Download, X } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { DialogClose, DialogPopup, DialogRoot } from "@/components/ui/dialog"
import { LoadingState } from "@/components/ui/loading-state"
import { useAttachmentDownload } from "@/hooks/use-attachment-download"
import { useTranslations } from "@/hooks/use-locale"
import { apiFailure } from "@/lib/api/errors"
import {
  attachmentUrl,
  type InboxMessage,
  inboxKeys,
} from "@/lib/api/inbox-queries"

export type InboxAttachmentData = InboxMessage["attachments"][number]

export interface InboxAttachmentViewerProps {
  attachment: InboxAttachmentData
  open: boolean
  onOpenChange: (open: boolean) => void
}

const PDF_MIME_TYPE = "application/pdf"

export function InboxAttachmentViewer({
  attachment,
  open,
  onOpenChange,
}: InboxAttachmentViewerProps) {
  const t = useTranslations()
  const name = attachment.filename
  const signed = useQuery({
    queryKey: inboxKeys.attachmentUrl(attachment.id),
    queryFn: () => attachmentUrl(attachment.id, "inline"),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
  })
  const { phase, download } = useAttachmentDownload(attachment.id)
  const refused = signed.isError ? apiFailure(signed.error) : null

  function body(): ReactNode {
    if (signed.isPending) {
      return <LoadingState label={t("inbox.previewLoading", { name })} />
    }

    if (signed.isError) {
      return (
        <Callout
          className="m-4"
          fix={refused?.fix ?? t("inbox.previewFailedFix")}
          title={refused?.message ?? t("inbox.previewFailed", { name })}
          tone="danger"
        />
      )
    }

    if (attachment.mime_type === PDF_MIME_TYPE) {
      return (
        <iframe
          className="h-full w-full"
          src={signed.data.url}
          title={t("inbox.previewFrame", { name })}
        />
      )
    }

    return (
      // biome-ignore lint/correctness/useImageSize: the image is whatever was attached; the box fits it once it loads
      <img
        alt={name}
        className="max-h-full max-w-full object-contain"
        src={signed.data.url}
      />
    )
  }

  return (
    <DialogRoot onOpenChange={onOpenChange} open={open}>
      <DialogPopup
        actions={
          <>
            <Button
              icon={phase === "failed" ? X : Download}
              loading={phase === "pending"}
              onClick={() => {
                download()
              }}
              size="sm"
            >
              {phase === "failed"
                ? t("inbox.downloadFailed", { name })
                : t("inbox.download")}
            </Button>
            <DialogClose
              render={
                <Button
                  aria-label={t("common.close")}
                  className="w-7 px-0"
                  icon={X}
                  size="sm"
                  title={t("common.close")}
                  variant="ghost"
                />
              }
            />
          </>
        }
        className="p-4"
        size="lg"
        title={name}
      >
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md bg-sunken">
          {body()}
        </div>
      </DialogPopup>
    </DialogRoot>
  )
}
