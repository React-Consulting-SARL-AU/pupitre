import { Dialog } from "@base-ui-components/react/dialog"
import {
  isMailSenderAddress,
  MAIL_SENDER_ADDRESSES,
} from "@pupitre/shared/legal"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { PenLine } from "lucide-react"
import { useState } from "react"
import { InboxAttachmentPicker } from "@/components/admin/inbox/inbox-attachment-picker"
import { InboxSendFailure } from "@/components/admin/inbox/inbox-send-failure"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useForm } from "@/hooks/use-form"
import { useTranslations } from "@/hooks/use-locale"
import { useToast } from "@/hooks/use-toast"
import {
  type ComposeEmail,
  composeEmail,
  inboxKeys,
  uploadAttachments,
} from "@/lib/api/inbox-queries"
import {
  type ComposeInput,
  type ComposeValues,
  composeSchema,
  MAX_SUBJECT_LENGTH,
} from "@/lib/schemas/inbox"

export interface InboxComposeDialogProps {
  addresses: string[]
}

export function InboxComposeDialog({ addresses }: InboxComposeDialogProps) {
  const t = useTranslations()
  const toasts = useToast()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const empty: ComposeInput = {
    from: MAIL_SENDER_ADDRESSES[0],
    to: "",
    subject: "",
    text: "",
  }
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState<string | null>(null)
  const form = useForm<ComposeInput, ComposeValues>({
    schema: composeSchema(t),
    defaultValues: empty,
  })
  const send = useMutation({
    mutationFn: async (input: ComposeEmail) => {
      const attachments = await uploadAttachments(files, (file) => {
        setSending(file.name)
      })

      setSending(null)
      await composeEmail({ ...input, attachments })
    },
    onSettled: () => {
      setSending(null)
    },
    onSuccess: async (_thread, input) => {
      setOpen(false)
      form.reset(empty)
      setFiles([])
      toasts.done(t("inbox.sent", { to: input.to.join(", ") }))
      await queryClient.invalidateQueries({ queryKey: inboxKeys.allThreads })
    },
  })
  const errors = form.formState.errors

  const submit = form.handleSubmit((values) => {
    send.mutate(values)
  })

  return (
    <Dialog.Root onOpenChange={setOpen} open={open}>
      <Dialog.Trigger
        render={
          <Button icon={PenLine} variant="primary">
            {t("inbox.compose")}
          </Button>
        }
      />
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-base/70 backdrop-blur-[2px]" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-surface p-6 shadow-overlay outline-none">
          <Dialog.Title className="font-bold font-display text-[16px] text-ink leading-[1.2]">
            {t("inbox.composeTitle")}
          </Dialog.Title>

          <form
            className="mt-gutter flex flex-col gap-gutter"
            noValidate
            onSubmit={(event) => {
              submit(event)
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="compose-from">{t("inbox.from")}</Label>
              <Select
                id="compose-from"
                items={addresses.map((address) => ({
                  value: address,
                  label: address,
                }))}
                onValueChange={(value) => {
                  if (isMailSenderAddress(value)) {
                    form.setValue("from", value)
                  }
                }}
                value={form.watch("from")}
              />
              <FieldError>{errors.from?.message}</FieldError>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="compose-to">{t("inbox.to")}</Label>
              <Input
                autoComplete="off"
                id="compose-to"
                placeholder={t("inbox.toPlaceholder")}
                {...form.register("to")}
              />
              <FieldError>{errors.to?.message}</FieldError>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="compose-subject">{t("inbox.subject")}</Label>
              <Input
                autoComplete="off"
                id="compose-subject"
                maxLength={MAX_SUBJECT_LENGTH}
                {...form.register("subject")}
              />
              <FieldError>{errors.subject?.message}</FieldError>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="compose-text">{t("inbox.text")}</Label>
              <Textarea id="compose-text" {...form.register("text")} />
              <FieldError>{errors.text?.message}</FieldError>
            </div>

            <InboxAttachmentPicker
              disabled={send.isPending}
              files={files}
              id="compose-files"
              onFilesChange={setFiles}
              sending={sending}
            />

            {send.isError ? (
              <InboxSendFailure
                error={send.error}
                fix={t("inbox.sendFailedFix")}
                title={t("inbox.sendFailed")}
              />
            ) : null}

            <div className="flex justify-end gap-2">
              <Dialog.Close
                render={<Button variant="ghost">{t("common.cancel")}</Button>}
              />
              <Button loading={send.isPending} type="submit" variant="primary">
                {sending
                  ? t("inbox.uploading", { name: sending })
                  : t("inbox.send")}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
