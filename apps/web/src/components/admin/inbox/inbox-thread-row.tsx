import { Link } from "@tanstack/react-router"
import { Checkbox } from "@/components/ui/checkbox"
import { useTranslations } from "@/hooks/use-locale"
import type { InboxMailbox, InboxThread } from "@/lib/api/inbox-queries"
import { correspondentLabel, lastActivity } from "@/lib/domain/inbox"
import type { InboxSearch } from "@/lib/domain/inbox-search"
import { cn } from "@/lib/utils/cn"
import { formatRelative } from "@/lib/utils/format"

export interface InboxThreadRowProps {
  thread: InboxThread
  mailbox: InboxMailbox | undefined
  search: InboxSearch
  selected: boolean
  onSelectedChange: (selected: boolean) => void
  /** The row the keyboard sits on, whether or not it is the open thread. */
  focused: boolean
  open: boolean
}

export function InboxThreadRow({
  thread,
  mailbox,
  search,
  selected,
  onSelectedChange,
  focused,
  open,
}: InboxThreadRowProps) {
  const t = useTranslations()
  const activity = lastActivity(thread)

  return (
    <li
      className={cn(
        "flex items-center gap-3 border-line border-b px-3 last:border-b-0",
        focused && "bg-raised",
        open && "bg-sunken"
      )}
      data-focused={focused || undefined}
      data-thread-id={thread.id}
    >
      <Checkbox
        checked={selected}
        label={t("inbox.selectThread")}
        onCheckedChange={onSelectedChange}
      />

      <Link
        className="flex min-w-0 flex-1 items-center gap-3 py-2.5 transition-fast focus-visible:outline-2 focus-visible:outline-ink focus-visible:-outline-offset-2"
        params={{ threadId: thread.id }}
        search={search}
        to="/dashboard/admin/inbox/$threadId"
      >
        <span className="flex w-2 shrink-0 justify-center">
          {thread.unread ? (
            <span className="size-2 rounded-full bg-ink">
              <span className="sr-only">{t("inbox.unreadMark")}</span>
            </span>
          ) : null}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span
              className={cn(
                "truncate text-[13px]",
                thread.unread ? "font-medium text-ink" : "text-ink-2"
              )}
            >
              {correspondentLabel(thread.from)}
            </span>
            <span className="shrink-0 text-[11px] text-ink-3">
              {t(activity.key, { when: formatRelative(activity.at, t) })}
            </span>
          </span>

          <span
            className={cn(
              "block truncate text-[13px]",
              thread.unread ? "font-medium text-ink" : "text-ink-2"
            )}
          >
            {thread.subject === "" ? t("inbox.noSubject") : thread.subject}
          </span>

          {thread.snippet ? (
            <span className="block truncate text-[12px] text-ink-3">
              {thread.snippet}
            </span>
          ) : null}

          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-sunken px-2 py-0.5 font-data text-[11px] text-ink-2">
              {mailbox?.display_name ?? thread.address}
            </span>
            {thread.linked_organization ? (
              <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] text-ink-2">
                {thread.linked_organization.name}
              </span>
            ) : null}
            {thread.has_draft ? (
              <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] text-ink-2">
                {t("inbox.draftBadge")}
              </span>
            ) : null}
            {thread.notes > 0 ? (
              <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] text-ink-2">
                {t.plural("inbox.notesBadge", thread.notes)}
              </span>
            ) : null}
            {thread.automated ? (
              <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] text-ink-2">
                {t("inbox.automatedBadge")}
              </span>
            ) : null}
            <span className="truncate text-[11px] text-ink-3">
              {thread.assigned_user
                ? thread.assigned_user.name
                : t("inbox.unassigned")}
            </span>
          </span>
        </span>
      </Link>
    </li>
  )
}
