import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { RotateCw } from "lucide-react"
import { useEffect, useRef } from "react"
import { InboxMessage } from "@/components/admin/inbox/inbox-message"
import { InboxReplyForm } from "@/components/admin/inbox/inbox-reply-form"
import { InboxThreadActions } from "@/components/admin/inbox/inbox-thread-actions"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { PageHeader } from "@/components/ui/page-header"
import { SkeletonCards } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/ui/status-badge"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import {
  inboxKeys,
  inboxThreadQueryOptions,
  patchThread,
} from "@/lib/api/inbox-queries"
import { canActOnPlatform } from "@/lib/domain/admin"
import { threadStatusLook } from "@/lib/domain/inbox"
import { pageTitle } from "@/lib/domain/page-titles"

export const INBOX_THREAD_ROUTE_ID = "/dashboard/admin/inbox/$threadId"

export interface InboxThreadProps {
  threadId: string
}

export function InboxThread({ threadId }: InboxThreadProps) {
  const t = useTranslations()
  const { platformRole } = useDashboardContext()
  const queryClient = useQueryClient()
  const { parents } = pageTitle(INBOX_THREAD_ROUTE_ID)
  const thread = useQuery(inboxThreadQueryOptions(threadId))
  const opened = useRef(false)
  const unread = thread.data?.unread ?? false

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

  return (
    <>
      <PageHeader
        actions={
          <InboxThreadActions
            assignedUserId={detail.assigned_user?.id ?? null}
            canAct={canAct}
            status={detail.status}
            threadId={detail.id}
            unread={detail.unread}
          />
        }
        parents={parents}
        title={detail.subject === "" ? t("inbox.noSubject") : detail.subject}
      />

      <div className="flex flex-col gap-gutter">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-sunken px-2 py-0.5 font-data text-[12px] text-ink-2">
            {detail.address}
          </span>
          <StatusBadge look={threadStatusLook(detail.status)} />
          {detail.contact?.user_id ? (
            <Link
              className="text-[13px] text-ink-2 underline transition-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
              params={{ id: detail.contact.user_id }}
              to="/dashboard/admin/users/$id"
            >
              {t("inbox.openContact", {
                name: detail.contact.name || detail.contact.email,
              })}
            </Link>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          {detail.messages.map((message) => (
            <InboxMessage key={message.id} message={message} />
          ))}
        </div>

        {canAct ? <InboxReplyForm threadId={detail.id} /> : null}
      </div>
    </>
  )
}
