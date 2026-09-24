import { useTranslations } from "@/hooks/use-locale"
import type { ServerDetail } from "@/lib/api/queries"
import {
  formatBackupInterval,
  formatDateTime,
  formatRelative,
} from "@/lib/utils/format"

export interface ServerBackupBeatProps {
  beat: NonNullable<ServerDetail["backup"]>
}

export function ServerBackupBeat({ beat }: ServerBackupBeatProps) {
  const t = useTranslations()
  const missing = beat.last_error ? 0 : (beat.last_warnings ?? 0)

  return (
    <dl className="grid gap-gutter px-4 py-3 sm:grid-cols-3">
      <div>
        <dt className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
          {t("backups.interval")}
        </dt>
        <dd className="text-[13px] text-ink">
          {formatBackupInterval(beat.interval_hours, t)}
        </dd>
      </div>
      <div>
        <dt className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
          {t("backups.lastOk")}
        </dt>
        <dd
          className="text-[13px] text-ink"
          title={
            beat.last_ok_at ? formatDateTime(beat.last_ok_at, t) : undefined
          }
        >
          {formatRelative(beat.last_ok_at ?? null, t)}
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
          {t("backups.lastError")}
        </dt>
        {missing > 0 ? (
          <dd className="text-[13px] text-warn">
            {t.plural("backups.missing", missing)}
          </dd>
        ) : (
          <dd
            className={
              beat.last_error
                ? "break-words font-data text-[12px] text-danger"
                : "text-[13px] text-ink-3"
            }
          >
            {beat.last_error ?? t("format.none")}
          </dd>
        )}
      </div>
    </dl>
  )
}
