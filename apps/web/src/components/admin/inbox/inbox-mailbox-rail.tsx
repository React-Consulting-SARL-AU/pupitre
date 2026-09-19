import { Link } from "@tanstack/react-router"
import { Settings2 } from "lucide-react"
import { Select } from "@/components/ui/select"
import { useTranslations } from "@/hooks/use-locale"
import type { InboxCounts, InboxMailbox } from "@/lib/api/inbox-queries"
import {
  MAILBOX_AUTOMATED,
  MAILBOX_EVERY,
  MAILBOX_OTHERS,
} from "@/lib/domain/inbox"
import type { InboxSearch } from "@/lib/domain/inbox-search"
import { cn } from "@/lib/utils/cn"

export interface InboxMailboxRailProps {
  mailboxes: InboxMailbox[]
  counts: InboxCounts | undefined
  value: string
  onValueChange: (value: string) => void
  /** The settings page sits under the same layout, which asks for the filters. */
  search: InboxSearch
}

interface RailEntry {
  value: string
  label: string
  unread: number
}

export function InboxMailboxRail({
  mailboxes,
  counts,
  value,
  onValueChange,
  search,
}: InboxMailboxRailProps) {
  const t = useTranslations()
  const unreadOf = (id: string) =>
    counts?.mailboxes.find((mailbox) => mailbox.id === id)?.unread ?? 0
  const others = counts?.others ?? { unread: 0, open: 0 }
  const entries: RailEntry[] = [
    {
      value: MAILBOX_EVERY,
      label: t("inbox.everyMailbox"),
      unread: counts?.total_unread ?? 0,
    },
    ...mailboxes
      .filter((mailbox) => mailbox.enabled)
      .map((mailbox) => ({
        value: mailbox.id,
        label: mailbox.display_name,
        unread: unreadOf(mailbox.id),
      })),
    ...(others.open > 0 || others.unread > 0
      ? [
          {
            value: MAILBOX_OTHERS,
            label: t("inbox.otherMailboxes"),
            unread: others.unread,
          },
        ]
      : []),
    {
      value: MAILBOX_AUTOMATED,
      label: t("inbox.automatedMailbox"),
      unread: 0,
    },
  ]

  return (
    <>
      <nav
        aria-label={t("inbox.mailboxes")}
        className="hidden w-[200px] shrink-0 flex-col gap-[2px] xl:flex"
      >
        {entries.map((entry) => (
          <button
            aria-pressed={entry.value === value}
            className={cn(
              "flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-fast",
              "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2",
              entry.value === value
                ? "bg-raised text-ink"
                : "text-ink-2 hover:bg-raised hover:text-ink"
            )}
            key={entry.value}
            onClick={() => {
              onValueChange(entry.value)
            }}
            type="button"
          >
            <span className="truncate">{entry.label}</span>
            {entry.unread > 0 ? (
              <span className="shrink-0 rounded-full bg-inverse px-1.5 font-data text-[11px] text-inverse-ink tabular-nums">
                {entry.unread}
              </span>
            ) : null}
          </button>
        ))}

        <Link
          className="mt-2 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-ink-3 transition-fast hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
          search={search}
          to="/dashboard/admin/inbox/mailboxes"
        >
          <Settings2 className="size-4" strokeWidth={1.5} />
          {t("inbox.mailboxSettings")}
        </Link>
      </nav>

      <div className="flex flex-col gap-2 xl:hidden">
        <Select
          className="w-[240px]"
          id="inbox-mailbox"
          items={entries.map((entry) => ({
            value: entry.value,
            label:
              entry.unread > 0
                ? `${entry.label} (${entry.unread})`
                : entry.label,
          }))}
          onValueChange={onValueChange}
          value={value}
        />
      </div>
    </>
  )
}
