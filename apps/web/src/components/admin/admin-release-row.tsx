import { ArrowUpCircle } from "lucide-react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { StatusDot } from "@/components/ui/status-dot"
import { useTranslations } from "@/hooks/use-locale"
import { channelKey, type ReleaseVersion } from "@/lib/domain/admin"
import { formatDateTime } from "@/lib/utils/format"

export interface AdminReleaseRowProps {
  version: ReleaseVersion
  /** What the promotion makes this version the target of, named in the confirmation. */
  target: string
  canPromote: boolean
  promoting: boolean
  onPromote: () => void
}

export function AdminReleaseRow({
  version,
  target,
  canPromote,
  promoting,
  onPromote,
}: AdminReleaseRowProps) {
  const t = useTranslations()
  const channels = version.channels
    .map((channel) => {
      const key = channelKey(channel)

      return key ? t(key) : channel
    })
    .join(" · ")

  return (
    <li
      aria-busy={promoting || undefined}
      className="flex flex-wrap items-center gap-4 border-line border-b px-4 py-3 last:border-b-0 sm:gap-6"
    >
      <p className="min-w-0 flex-1 truncate font-data text-[13px] text-ink tabular-nums">
        {version.version}
      </p>

      <span className="inline-flex items-center gap-2 text-[12px] text-ink-2 sm:w-40">
        <StatusDot
          label={channels}
          shape={version.stable ? "filled" : "hollow"}
          tone={version.stable ? "ok" : "muted"}
        />
        {channels}
      </span>

      <p className="font-data text-[12px] text-ink-3 tabular-nums sm:w-24">
        {t.plural("admin.releases.builds", version.builds)}
      </p>

      <p className="font-data text-[12px] text-ink-3 tabular-nums sm:w-44">
        {formatDateTime(version.publishedAt, t)}
      </p>

      <div className="sm:w-40 sm:text-right">
        {canPromote && !version.stable ? (
          <ConfirmDialog
            busy={promoting}
            busyLabel={t("admin.releases.promoting")}
            confirmLabel={t("admin.releases.promote")}
            description={t("admin.releases.promoteDescription", {
              version: version.version,
              target,
            })}
            onConfirm={onPromote}
            title={t("admin.releases.promoteTitle")}
            triggerIcon={ArrowUpCircle}
            triggerLabel={t("admin.releases.promote")}
            triggerVariant="secondary"
          />
        ) : null}
      </div>
    </li>
  )
}
