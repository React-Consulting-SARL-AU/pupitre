import { useQuery } from "@tanstack/react-query"
import { CheckCheck, FolderCheck, FolderOpen, MailOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { useTranslations } from "@/hooks/use-locale"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import {
  inboxKeys,
  patchThread,
  platformTeamQueryOptions,
  type ThreadPatch,
} from "@/lib/api/inbox-queries"

const NOBODY = ""

export interface InboxThreadActionsProps {
  threadId: string
  unread: boolean
  status: string
  assignedUserId: string | null
  canAct: boolean
}

export function InboxThreadActions({
  threadId,
  unread,
  status,
  assignedUserId,
  canAct,
}: InboxThreadActionsProps) {
  const t = useTranslations()
  const team = useQuery({ ...platformTeamQueryOptions(), enabled: canAct })
  const change = useOptimisticMutation<ThreadPatch, unknown>({
    mutationFn: (patch) => patchThread(threadId, patch),
    invalidate: [
      inboxKeys.thread(threadId),
      inboxKeys.allThreads,
      inboxKeys.counts,
    ],
    toast: {
      failed: () => ({
        title: t("inbox.changeFailed"),
        fix: t("inbox.changeFailedFix"),
      }),
    },
  })
  const closed = status === "closed"

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        icon={unread ? CheckCheck : MailOpen}
        loading={change.isPending}
        onClick={() => {
          change.mutate({ unread: !unread })
        }}
        size="sm"
        title={unread ? undefined : t("inbox.shortcutUnread")}
      >
        {unread ? t("inbox.markRead") : t("inbox.markUnread")}
      </Button>

      {canAct ? (
        <Button
          icon={closed ? FolderOpen : FolderCheck}
          loading={change.isPending}
          onClick={() => {
            change.mutate({ status: closed ? "open" : "closed" })
          }}
          size="sm"
          title={closed ? undefined : t("inbox.shortcutClose")}
        >
          {closed ? t("inbox.reopenThread") : t("inbox.closeThread")}
        </Button>
      ) : null}

      {canAct ? (
        <div className="flex items-center gap-2">
          <Label htmlFor="inbox-assignee">{t("inbox.assignee")}</Label>
          <Select
            className="w-[180px]"
            id="inbox-assignee"
            items={[
              { value: NOBODY, label: t("inbox.assignedNobody") },
              ...(team.data ?? []).map((member) => ({
                value: member.user_id,
                label: member.name,
              })),
            ]}
            onValueChange={(value) => {
              change.mutate({
                assigned_user_id: value === NOBODY ? null : value,
              })
            }}
            value={assignedUserId ?? NOBODY}
          />
        </div>
      ) : null}
    </div>
  )
}
