import { Link } from "@tanstack/react-router"
import { Checkbox } from "@/components/ui/checkbox"
import { useTranslations } from "@/hooks/use-locale"
import type { InboxMailbox, InboxThread } from "@/lib/api/inbox-queries"
import {
  correspondentLabel,
  INBOX_SHORTCUTS,
  lastActivity,
  shortcutTitle,
} from "@/lib/domain/inbox"
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
  const tags = [
    thread.linked_organization?.name,
    thread.has_draft ? t("inbox.draftBadge") : null,
    thread.notes > 0 ? t.plural("inbox.notesBadge", thread.notes) : null,
    thread.automated ? t("inbox.automatedBadge") : null,
  ].filter((tag): tag is string => Boolean(tag))

  return (
    <li
      className={cn(
        "relative flex items-start gap-3 border-line border-b pr-4 pl-3 last:border-b-0",
        thread.unread &&
          "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-ink",
        focused && "bg-raised",
        open && "bg-sunken"
      )}
      data-focused={focused || undefined}
      data-thread-id={thread.id}
    >
      <span className="flex h-[52px] items-center">
        <Checkbox
          checked={selected}
          label={t("inbox.selectThread")}
          onCheckedChange={onSelectedChange}
          title={shortcutTitle(t, INBOX_SHORTCUTS.select)}
        />
      </span>

      <Link
        className="flex min-w-0 flex-1 flex-col gap-0.5 py-3 transition-fast focus-visible:outline-2 focus-visible:outline-ink focus-visible:-outline-offset-2"
        params={{ threadId: thread.id }}
        search={search}
        title={shortcutTitle(t, INBOX_SHORTCUTS.open)}
        to="/dashboard/admin/inbox/$threadId"
      >
        <span className="flex items-baseline justify-between gap-3">
          <span
            className={cn(
              "truncate text-[13px]",
              thread.unread ? "font-semibold text-ink" : "text-ink-2"
            )}
          >
            {correspondentLabel(thread.from)}
          </span>
          <span
            className={cn(
              "shrink-0 font-data text-[11px] tabular-nums",
              thread.unread ? "text-ink" : "text-ink-3"
            )}
          >
            {t(activity.key, { when: formatRelative(activity.at, t) })}
          </span>
        </span>

        <span
          className={cn(
            "truncate text-[14px] leading-[1.35]",
            thread.unread ? "font-semibold text-ink" : "text-ink"
          )}
        >
          {thread.subject === "" ? t("inbox.noSubject") : thread.subject}
          {thread.unread ? (
            <span className="sr-only"> {t("inbox.unreadMark")}</span>
          ) : null}
        </span>

        {thread.snippet ? (
          <span className="truncate text-[13px] text-ink-3">
            {thread.snippet}
          </span>
        ) : null}

        <span className="mt-1.5 flex min-w-0 items-center gap-2 text-[11px] text-ink-3">
          <span className="shrink-0 rounded-sm bg-sunken px-1.5 py-px font-data text-ink-2">
            {mailbox?.display_name ?? thread.address}
          </span>
          {thread.sender_authenticated ? null : (
            <span className="shrink-0 text-warn">
              {t("inbox.unverifiedSender")}
            </span>
          )}
          {tags.length > 0 ? (
            <span className="truncate">{tags.join(" · ")}</span>
          ) : null}
          <span className="ml-auto shrink-0 truncate">
            {thread.assigned_user
              ? thread.assigned_user.name
              : t("inbox.unassigned")}
          </span>
        </span>
      </Link>
    </li>
  )
}
