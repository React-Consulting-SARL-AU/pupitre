import { useMutation, useQueryClient } from "@tanstack/react-query"
import { SendHorizontal } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { InboxAttachmentPicker } from "@/components/admin/inbox/inbox-attachment-picker"
import { InboxRecipientField } from "@/components/admin/inbox/inbox-recipient-field"
import { InboxSendFailure } from "@/components/admin/inbox/inbox-send-failure"
import { InboxTemplateMenu } from "@/components/admin/inbox/inbox-template-menu"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field-error"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useTranslations } from "@/hooks/use-locale"
import { useToast } from "@/hooks/use-toast"
import {
  inboxKeys,
  replyToThread,
  saveDraft,
  uploadAttachments,
} from "@/lib/api/inbox-queries"
import { DRAFT_SAVE_DELAY_MS } from "@/lib/domain/inbox"

export interface InboxReplyFormProps {
  threadId: string
  mailboxId: string
  mailboxName: string
  signature: string | null
  draftBody: string
  draftTo: string[]
  draftCc: string[]
  defaultTo: string[]
}

export function InboxReplyForm({
  threadId,
  mailboxId,
  mailboxName,
  signature,
  draftBody,
  draftTo,
  draftCc,
  defaultTo,
}: InboxReplyFormProps) {
  const t = useTranslations()
  const toasts = useToast()
  const queryClient = useQueryClient()
  const [text, setText] = useState(draftBody)
  const [to, setTo] = useState(draftTo.length > 0 ? draftTo : defaultTo)
  const [cc, setCc] = useState(draftCc)
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [kept, setKept] = useState(false)
  const settled = useRef(false)

  const send = useMutation({
    mutationFn: async () => {
      const attachments = await uploadAttachments(files, (file) => {
        setSending(file.name)
      })

      setSending(null)
      await replyToThread(threadId, { text, to, cc, attachments })
    },
    onSettled: () => {
      setSending(null)
    },
    onSuccess: async () => {
      setText("")
      setFiles([])
      setKept(false)
      toasts.done(t("inbox.replySent"))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: inboxKeys.thread(threadId) }),
        queryClient.invalidateQueries({ queryKey: inboxKeys.allThreads }),
      ])
    },
  })

  useEffect(() => {
    if (!settled.current) {
      settled.current = true

      return
    }

    if (text === "") {
      return
    }

    const timer = setTimeout(() => {
      saveDraft(threadId, { body: text, to, cc })
        .then(() => {
          setKept(true)
        })
        .catch(() => {
          setKept(false)
        })
    }, DRAFT_SAVE_DELAY_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [text, to, cc, threadId])

  function submit() {
    if (text.trim() === "") {
      setRefusal(t("inbox.replyRequired"))

      return
    }

    setRefusal(null)
    send.mutate()
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-md border border-line-strong bg-surface px-4 py-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <InboxRecipientField
        addresses={to}
        disabled={send.isPending}
        id="inbox-reply-to"
        label={t("inbox.to")}
        onAddressesChange={setTo}
      />

      <InboxRecipientField
        addresses={cc}
        disabled={send.isPending}
        id="inbox-reply-cc"
        label={t("inbox.cc")}
        onAddressesChange={setCc}
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor="inbox-reply">{t("inbox.reply")}</Label>
        <Textarea
          disabled={send.isPending}
          id="inbox-reply"
          onChange={(event) => {
            setText(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              submit()
            }
          }}
          value={text}
        />
        <FieldError>{refusal}</FieldError>
      </div>

      {signature ? (
        <div className="flex flex-col gap-1">
          <p className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
            {t("inbox.signature", { mailbox: mailboxName })}
          </p>
          <pre className="whitespace-pre-wrap break-words font-sans text-[12px] text-ink-3">
            {signature}
          </pre>
        </div>
      ) : null}

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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <InboxTemplateMenu
            disabled={send.isPending}
            mailboxId={mailboxId}
            onPick={(body) => {
              setText(text === "" ? body : `${text}\n\n${body}`)
            }}
          />
          {kept ? (
            <span className="text-[12px] text-ink-3">
              {t("inbox.draftSaved")}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-ink-3">{t("inbox.sendHint")}</span>
          <Button
            icon={SendHorizontal}
            loading={send.isPending}
            title={t("inbox.sendHint")}
            type="submit"
            variant="primary"
          >
            {sending
              ? t("inbox.uploading", { name: sending })
              : t("inbox.send")}
          </Button>
        </div>
      </div>
    </form>
  )
}
