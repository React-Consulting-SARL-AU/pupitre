import { Callout } from "@/components/ui/callout"
import { useTranslations } from "@/hooks/use-locale"
import { apiFailure } from "@/lib/api/errors"
import { AttachmentUploadError } from "@/lib/api/inbox-queries"

export interface InboxSendFailureProps {
  error: unknown
  /** What the form says when the refusal names neither a file nor a reason. */
  title: string
  fix: string
}

/** A send fails on an upload, on the API, or on nothing named: each says what it can. */
export function InboxSendFailure({ error, title, fix }: InboxSendFailureProps) {
  const t = useTranslations()

  if (error instanceof AttachmentUploadError) {
    return (
      <Callout
        fix={t("inbox.uploadFailedFix")}
        title={t("inbox.uploadFailed", { name: error.filename })}
        tone="danger"
      />
    )
  }

  const refused = apiFailure(error)

  return (
    <Callout
      fix={refused?.fix ?? fix}
      title={refused?.message ?? title}
      tone="danger"
    />
  )
}
