import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { PenLine } from "lucide-react"
import { useState } from "react"
import { InboxAttachmentPicker } from "@/components/admin/inbox/inbox-attachment-picker"
import { InboxSendFailure } from "@/components/admin/inbox/inbox-send-failure"
import { InboxTemplateMenu } from "@/components/admin/inbox/inbox-template-menu"
import { Button } from "@/components/ui/button"
import {
  DialogClose,
  DialogPopup,
  DialogRoot,
  DialogTrigger,
} from "@/components/ui/dialog"
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
  type InboxMailbox,
  inboxKeys,
  uploadAttachments,
} from "@/lib/api/inbox-queries"
import { parseInboxSearch } from "@/lib/domain/inbox-search"
import {
  type ComposeInput,
  type ComposeValues,
  composeSchema,
  MAX_SUBJECT_LENGTH,
} from "@/lib/schemas/inbox"

export interface InboxComposeDialogProps {
  mailboxes: InboxMailbox[]
}

export function InboxComposeDialog({ mailboxes }: InboxComposeDialogProps) {
  const t = useTranslations()
  const toasts = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const senders = mailboxes.filter(
    (mailbox) => mailbox.can_reply && mailbox.enabled
  )
  const empty: ComposeInput = {
    mailbox_id: senders[0]?.id ?? "",
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

      return await composeEmail({ ...input, attachments })
    },
    onSettled: () => {
      setSending(null)
    },
    onSuccess: async (threadId, input) => {
      setOpen(false)
      form.reset(empty)
      setFiles([])
      toasts.done(t("inbox.sent", { to: input.to.join(", ") }))
      await queryClient.invalidateQueries({ queryKey: inboxKeys.allThreads })
      navigate({
        to: "/dashboard/admin/inbox/$threadId",
        params: { threadId },
        search: parseInboxSearch({}),
      })
    },
  })
  const errors = form.formState.errors
  const mailboxId = form.watch("mailbox_id")

  const submit = form.handleSubmit((values) => {
    send.mutate(values)
  })

  return (
    <DialogRoot onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button icon={PenLine} variant="primary">
            {t("inbox.compose")}
          </Button>
        }
      />
      <DialogPopup title={t("inbox.composeTitle")}>
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
              items={senders.map((mailbox) => ({
                value: mailbox.id,
                label: `${mailbox.display_name} · ${mailbox.address}`,
              }))}
              onValueChange={(value) => {
                form.setValue("mailbox_id", value)
              }}
              value={mailboxId}
            />
            <FieldError>{errors.mailbox_id?.message}</FieldError>
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

          <div className="flex">
            <InboxTemplateMenu
              disabled={send.isPending}
              mailboxId={mailboxId}
              onPick={(body) => {
                form.setValue("text", body)
              }}
            />
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
            <DialogClose
              render={<Button variant="ghost">{t("common.cancel")}</Button>}
            />
            <Button loading={send.isPending} type="submit" variant="primary">
              {sending
                ? t("inbox.uploading", { name: sending })
                : t("inbox.send")}
            </Button>
          </div>
        </form>
      </DialogPopup>
    </DialogRoot>
  )
}
