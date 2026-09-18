import { useMutation, useQueryClient } from "@tanstack/react-query"
import { SendHorizontal } from "lucide-react"
import { useState } from "react"
import { InboxAttachmentPicker } from "@/components/admin/inbox/inbox-attachment-picker"
import { InboxSendFailure } from "@/components/admin/inbox/inbox-send-failure"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field-error"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useForm } from "@/hooks/use-form"
import { useTranslations } from "@/hooks/use-locale"
import { useToast } from "@/hooks/use-toast"
import {
  inboxKeys,
  replyToThread,
  uploadAttachments,
} from "@/lib/api/inbox-queries"
import {
  type ReplyInput,
  type ReplyValues,
  replySchema,
} from "@/lib/schemas/inbox"

const EMPTY: ReplyInput = { text: "" }

export interface InboxReplyFormProps {
  threadId: string
}

export function InboxReplyForm({ threadId }: InboxReplyFormProps) {
  const t = useTranslations()
  const toasts = useToast()
  const queryClient = useQueryClient()
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState<string | null>(null)
  const form = useForm<ReplyInput, ReplyValues>({
    schema: replySchema(t),
    defaultValues: EMPTY,
  })
  const send = useMutation({
    mutationFn: async (values: ReplyValues) => {
      const attachments = await uploadAttachments(files, (file) => {
        setSending(file.name)
      })

      setSending(null)
      await replyToThread(threadId, { text: values.text, attachments })
    },
    onSettled: () => {
      setSending(null)
    },
    onSuccess: async () => {
      form.reset(EMPTY)
      setFiles([])
      toasts.done(t("inbox.replySent"))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: inboxKeys.thread(threadId) }),
        queryClient.invalidateQueries({ queryKey: inboxKeys.allThreads }),
      ])
    },
  })

  const submit = form.handleSubmit((values) => {
    send.mutate(values)
  })

  return (
    <form
      className="flex flex-col gap-2"
      noValidate
      onSubmit={(event) => {
        submit(event)
      }}
    >
      <Label htmlFor="inbox-reply">{t("inbox.reply")}</Label>
      <Textarea
        disabled={send.isPending}
        id="inbox-reply"
        {...form.register("text")}
      />
      <FieldError>{form.formState.errors.text?.message}</FieldError>

      <InboxAttachmentPicker
        disabled={send.isPending}
        files={files}
        id="inbox-reply-files"
        onFilesChange={setFiles}
        sending={sending}
      />

      {send.isError ? (
        <InboxSendFailure
          error={send.error}
          fix={t("inbox.replyFailedFix")}
          title={t("inbox.replyFailed")}
        />
      ) : null}

      <div className="flex justify-end">
        <Button
          icon={SendHorizontal}
          loading={send.isPending}
          type="submit"
          variant="primary"
        >
          {sending ? t("inbox.uploading", { name: sending }) : t("inbox.send")}
        </Button>
      </div>
    </form>
  )
}
