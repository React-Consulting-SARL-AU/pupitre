import { useTranslations } from "@/hooks/use-locale"
import type { InboxActivity } from "@/lib/api/inbox-queries"
import type { DictionaryKey } from "@/lib/i18n/en"
import { formatDateTime } from "@/lib/utils/format"

export interface InboxActivityListProps {
  activities: InboxActivity[]
}

export function InboxActivityList({ activities }: InboxActivityListProps) {
  const t = useTranslations()

  if (activities.length === 0) {
    return <p className="text-[12px] text-ink-3">{t("inbox.activityEmpty")}</p>
  }

  return (
    <ol className="flex flex-col gap-2">
      {[...activities].reverse().map((activity) => (
        <li className="flex flex-col gap-0.5" key={activity.id}>
          <span className="text-[13px] text-ink-2">
            {t(`inbox.activity.${activity.action}` as DictionaryKey)}
          </span>
          <span className="text-[11px] text-ink-3">
            {activity.actor ? `${activity.actor.name} · ` : ""}
            {formatDateTime(activity.created_at, t)}
          </span>
        </li>
      ))}
    </ol>
  )
}
