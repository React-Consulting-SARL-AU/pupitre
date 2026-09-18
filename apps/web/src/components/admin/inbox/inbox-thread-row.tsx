import { Link } from "@tanstack/react-router"
import { useTranslations } from "@/hooks/use-locale"
import type { InboxThread } from "@/lib/api/inbox-queries"
import { correspondentLabel, lastActivity } from "@/lib/domain/inbox"
import { formatRelative } from "@/lib/utils/format"

export interface InboxThreadRowProps {
  thread: InboxThread
}

export function InboxThreadRow({ thread }: InboxThreadRowProps) {
  const t = useTranslations()
  const activity = lastActivity(thread)

  return (
    <li className="border-line border-b last:border-b-0">
      <Link
        className="flex flex-wrap items-center gap-4 px-4 py-3 transition-fast hover:bg-raised focus-visible:outline-2 focus-visible:outline-ink focus-visible:-outline-offset-2 sm:gap-6"
        params={{ threadId: thread.id }}
        to="/dashboard/admin/inbox/$threadId"
      >
        <span className="flex w-3 shrink-0 justify-center">
          {thread.unread ? (
            <span className="size-2 rounded-full bg-ink">
              <span className="sr-only">{t("inbox.unreadMark")}</span>
            </span>
          ) : null}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-[13px] text-ink">
            {thread.subject === "" ? t("inbox.noSubject") : thread.subject}
          </span>
          <span className="block truncate text-[12px] text-ink-3">
            {correspondentLabel(thread.from)}
            {thread.snippet ? ` — ${thread.snippet}` : ""}
          </span>
        </span>

        <span className="shrink-0 rounded-full bg-sunken px-2 py-0.5 font-data text-[11px] text-ink-2">
          {thread.address}
        </span>

        <span className="min-w-0 truncate text-[12px] text-ink-2 sm:w-36">
          {thread.assigned_user
            ? thread.assigned_user.name
            : t("inbox.unassigned")}
        </span>

        <span className="w-24 shrink-0 text-right">
          <span className="block font-data text-[12px] text-ink-2 tabular-nums">
            {t.plural("inbox.messages", thread.messages)}
          </span>
          <span className="block text-[12px] text-ink-3">
            {t(activity.key, { when: formatRelative(activity.at, t) })}
          </span>
        </span>
      </Link>
    </li>
  )
}
