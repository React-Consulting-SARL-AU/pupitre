import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { AdminFailure } from "@/components/admin/admin-failure"
import {
  InboxMailboxForm,
  type MailboxFlags,
} from "@/components/admin/inbox/inbox-mailbox-form"
import { InboxMailboxRow } from "@/components/admin/inbox/inbox-mailbox-row"
import { InboxTemplateSettings } from "@/components/admin/inbox/inbox-template-settings"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"
import { SkeletonRows } from "@/components/ui/skeleton"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { useToast } from "@/hooks/use-toast"
import { apiFailure } from "@/lib/api/errors"
import {
  createMailbox,
  inboxKeys,
  inboxMailboxesQueryOptions,
} from "@/lib/api/inbox-queries"
import { canActOnPlatform } from "@/lib/domain/admin"
import { pageTitle } from "@/lib/domain/page-titles"

export const INBOX_MAILBOXES_ROUTE_ID = "/dashboard/admin/inbox/mailboxes"

const NEW_FLAGS: MailboxFlags = {
  sensitive: false,
  can_reply: true,
  enabled: true,
}

export function InboxMailboxSettings() {
  const t = useTranslations()
  const toasts = useToast()
  const queryClient = useQueryClient()
  const { platformRole } = useDashboardContext()
  const { title, parents } = pageTitle(INBOX_MAILBOXES_ROUTE_ID)
  const mailboxes = useQuery(inboxMailboxesQueryOptions())
  const [flags, setFlags] = useState<MailboxFlags>(NEW_FLAGS)
  const canAct = canActOnPlatform(platformRole)

  const open = useMutation({
    mutationFn: (values: {
      address: string
      display_name: string
      signature: string
    }) =>
      createMailbox({
        address: values.address,
        display_name: values.display_name,
        signature: values.signature === "" ? null : values.signature,
        sensitive: flags.sensitive,
        can_reply: flags.can_reply,
      }),
    onSuccess: async (mailbox) => {
      setFlags(NEW_FLAGS)
      toasts.done(t("inbox.mailboxCreated", { address: mailbox.address }))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: inboxKeys.mailboxes }),
        queryClient.invalidateQueries({ queryKey: inboxKeys.counts }),
      ])
    },
    onError: (error) => {
      const refusal = apiFailure(error)

      toasts.failed({
        title: refusal?.message ?? t("inbox.mailboxFailed"),
        fix: refusal?.fix ?? t("inbox.mailboxFailedFix"),
      })
    },
  })

  return (
    <>
      <PageHeader parents={parents} title={t(title)} />

      <div className="flex flex-col gap-gutter">
        {mailboxes.isPending ? (
          <SkeletonRows label={t("admin.reading")} />
        ) : null}

        {mailboxes.isError ? (
          <AdminFailure
            fetching={mailboxes.isFetching}
            onRetry={() => {
              mailboxes.refetch()
            }}
          />
        ) : null}

        {(mailboxes.data ?? []).map((mailbox) => (
          <InboxMailboxRow canAct={canAct} key={mailbox.id} mailbox={mailbox} />
        ))}

        {canAct ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("inbox.mailboxNew")}</CardTitle>
            </CardHeader>
            <CardBody>
              <InboxMailboxForm
                addressLocked={false}
                defaults={{ address: "", display_name: "", signature: "" }}
                flags={flags}
                id="mailbox-new"
                onFlagsChange={setFlags}
                onSubmit={(values) => {
                  open.mutate(values)
                }}
                pending={open.isPending}
                submitLabel={t("inbox.mailboxCreate")}
              />
            </CardBody>
          </Card>
        ) : null}

        <InboxTemplateSettings
          canAct={canAct}
          mailboxes={mailboxes.data ?? []}
        />
      </div>
    </>
  )
}
