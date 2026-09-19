import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowLeft, RotateCw } from "lucide-react"
import { useEffect, useRef } from "react"
import { InboxReplyForm } from "@/components/admin/inbox/inbox-reply-form"
import { InboxThreadActions } from "@/components/admin/inbox/inbox-thread-actions"
import { InboxThreadAside } from "@/components/admin/inbox/inbox-thread-aside"
import { InboxThreadMessages } from "@/components/admin/inbox/inbox-thread-messages"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { SkeletonCards } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/ui/status-badge"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { useToast } from "@/hooks/use-toast"
import {
  inboxKeys,
  inboxThreadQueryOptions,
  patchThread,
} from "@/lib/api/inbox-queries"
import { canActOnPlatform } from "@/lib/domain/admin"
import { threadStatusLook } from "@/lib/domain/inbox"
import type { InboxSearch } from "@/lib/domain/inbox-search"

export const INBOX_THREAD_ROUTE_ID = "/dashboard/admin/inbox/$threadId"

export interface InboxThreadProps {
  threadId: string
  search: InboxSearch
}

export function InboxThread({ threadId, search }: InboxThreadProps) {
  const t = useTranslations()
  const toasts = useToast()
  const { platformRole } = useDashboardContext()
  const queryClient = useQueryClient()
  const thread = useQuery(inboxThreadQueryOptions(threadId))
  const opened = useRef(false)
  const unread = thread.data?.unread ?? false

  const link = useMutation({
    mutationFn: (organizationId: string | null) =>
      patchThread(threadId, { linked_organization_id: organizationId }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: inboxKeys.thread(threadId) }),
        queryClient.invalidateQueries({ queryKey: inboxKeys.allThreads }),
      ]),
    onError: () => {
      toasts.failed({
        title: t("inbox.changeFailed"),
        fix: t("inbox.changeFailedFix"),
      })
    },
  })

  useEffect(() => {
    if (opened.current || !unread) {
      return
    }

    opened.current = true

    patchThread(threadId, { unread: false })
      .then(() =>
        Promise.all([
          queryClient.invalidateQueries({
            queryKey: inboxKeys.thread(threadId),
          }),
          queryClient.invalidateQueries({ queryKey: inboxKeys.allThreads }),
          queryClient.invalidateQueries({ queryKey: inboxKeys.counts }),
        ])
      )
      .catch(() => {
        opened.current = false
      })
  }, [unread, threadId, queryClient])

  if (thread.isPending) {
    return <SkeletonCards label={t("admin.reading")} />
  }

  if (thread.isError) {
    return (
      <Callout
        action={
          <Button
            icon={RotateCw}
            loading={thread.isFetching}
            onClick={() => {
              thread.refetch()
            }}
            size="sm"
          >
            {t("common.retry")}
          </Button>
        }
        fix={t("inbox.threadFailedFix")}
        title={t("inbox.threadFailed")}
        tone="danger"
      />
    )
  }

  const detail = thread.data
  const canAct = canActOnPlatform(platformRole)
  const mailbox = detail.mailbox
  const canReply = Boolean(canAct && mailbox?.can_reply && mailbox.enabled)
  const lastInbound = [...detail.messages]
    .reverse()
    .find((message) => message.direction === "inbound" && !message.automated)

  return (
    <div className="flex min-w-0 flex-col gap-gutter 2xl:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-gutter">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            className="inline-flex items-center gap-1 text-[13px] text-ink-2 transition-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2 lg:hidden"
            search={search}
            to="/dashboard/admin/inbox"
          >
            <ArrowLeft className="size-4" strokeWidth={1.5} />
            {t("inbox.backToList")}
          </Link>

          <InboxThreadActions
            assignedUserId={detail.assigned_user?.id ?? null}
            canAct={canAct}
            status={detail.status}
            threadId={detail.id}
            unread={detail.unread}
          />
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="font-bold font-display text-[18px] text-ink leading-[1.2]">
            {detail.subject === "" ? t("inbox.noSubject") : detail.subject}
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-sunken px-2 py-0.5 font-data text-[12px] text-ink-2">
              {mailbox?.display_name ?? detail.address}
            </span>
            <StatusBadge look={threadStatusLook(detail.status)} />
          </div>
        </div>

        <InboxThreadMessages messages={detail.messages} />

        {detail.status === "closed" ? (
          <Callout
            action={
              canAct ? (
                <InboxThreadActions
                  assignedUserId={detail.assigned_user?.id ?? null}
                  canAct={canAct}
                  status={detail.status}
                  threadId={detail.id}
                  unread={detail.unread}
                />
              ) : undefined
            }
            title={t("inbox.threadClosed")}
            tone="neutral"
          />
        ) : null}

        {canReply && detail.status === "open" && mailbox ? (
          <InboxReplyForm
            defaultTo={lastInbound ? [lastInbound.from.email] : []}
            draftBody={detail.draft?.body ?? ""}
            draftCc={detail.draft?.cc ?? []}
            draftTo={detail.draft?.to ?? []}
            key={detail.id}
            mailboxId={mailbox.id}
            mailboxName={mailbox.display_name}
            signature={mailbox.signature}
            threadId={detail.id}
          />
        ) : null}
      </div>

      <aside className="w-full shrink-0 2xl:w-[320px]">
        <InboxThreadAside
          activities={detail.activities}
          address={detail.address}
          assignedName={detail.assigned_user?.name ?? null}
          canAct={canAct}
          contact={detail.contact}
          createdAt={detail.created_at}
          lastInboundAt={detail.last_inbound_at}
          lastOutboundAt={detail.last_outbound_at}
          linkPending={link.isPending}
          mailboxName={mailbox?.display_name ?? null}
          notes={detail.notes}
          onLink={(organizationId) => {
            link.mutate(organizationId)
          }}
          organization={detail.linked_organization}
          threadId={detail.id}
        />
      </aside>
    </div>
  )
}
