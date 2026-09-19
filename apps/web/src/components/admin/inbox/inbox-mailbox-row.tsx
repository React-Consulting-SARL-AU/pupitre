import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Trash2 } from "lucide-react"
import { useState } from "react"
import {
  InboxMailboxForm,
  type MailboxFlags,
} from "@/components/admin/inbox/inbox-mailbox-form"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useTranslations } from "@/hooks/use-locale"
import { useToast } from "@/hooks/use-toast"
import { apiFailure } from "@/lib/api/errors"
import {
  deleteMailbox,
  type InboxMailbox,
  inboxKeys,
  patchMailbox,
} from "@/lib/api/inbox-queries"

export interface InboxMailboxRowProps {
  mailbox: InboxMailbox
  canAct: boolean
}

export function InboxMailboxRow({ mailbox, canAct }: InboxMailboxRowProps) {
  const t = useTranslations()
  const toasts = useToast()
  const queryClient = useQueryClient()
  const [flags, setFlags] = useState<MailboxFlags>({
    sensitive: mailbox.sensitive,
    can_reply: mailbox.can_reply,
    enabled: mailbox.enabled,
  })

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: inboxKeys.mailboxes }),
      queryClient.invalidateQueries({ queryKey: inboxKeys.counts }),
    ])

  const failed = (error: unknown) => {
    const refusal = apiFailure(error)

    toasts.failed({
      title: refusal?.message ?? t("inbox.mailboxFailed"),
      fix: refusal?.fix ?? t("inbox.mailboxFailedFix"),
    })
  }

  const save = useMutation({
    mutationFn: (values: { display_name: string; signature: string }) =>
      patchMailbox(mailbox.id, {
        display_name: values.display_name,
        signature: values.signature === "" ? null : values.signature,
        ...flags,
      }),
    onSuccess: async () => {
      toasts.done(t("inbox.mailboxSaved", { address: mailbox.address }))
      await refresh()
    },
    onError: failed,
  })

  const remove = useMutation({
    mutationFn: () => deleteMailbox(mailbox.id),
    onSuccess: async () => {
      toasts.done(t("inbox.mailboxDeleted", { address: mailbox.address }))
      await refresh()
    },
    onError: failed,
  })

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 flex-col">
          <CardTitle>{mailbox.display_name}</CardTitle>
          <span className="truncate font-data text-[12px] text-ink-3">
            {mailbox.address}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-data text-[12px] text-ink-3 tabular-nums">
            {t.plural("inbox.mailboxThreads", mailbox.threads)}
          </span>
          {mailbox.enabled ? null : (
            <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] text-ink-2">
              {t("inbox.mailboxDisabled")}
            </span>
          )}
          {canAct ? (
            <ConfirmDialog
              busy={remove.isPending}
              confirmLabel={t("inbox.mailboxDelete")}
              description={t("inbox.mailboxDeleteConfirm", {
                address: mailbox.address,
              })}
              onConfirm={() => {
                remove.mutate()
              }}
              title={t("inbox.mailboxDelete")}
              triggerIcon={Trash2}
              triggerIconOnly
              triggerLabel={t("inbox.mailboxDelete")}
            />
          ) : null}
        </div>
      </CardHeader>

      {canAct ? (
        <CardBody>
          <InboxMailboxForm
            addressLocked
            defaults={{
              address: mailbox.address,
              display_name: mailbox.display_name,
              signature: mailbox.signature ?? "",
            }}
            flags={flags}
            id={`mailbox-${mailbox.id}`}
            onFlagsChange={setFlags}
            onSubmit={(values) => {
              save.mutate(values)
            }}
            pending={save.isPending}
            submitLabel={t("inbox.mailboxSave")}
          />
        </CardBody>
      ) : null}
    </Card>
  )
}
