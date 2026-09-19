import { ArrowUpCircle } from "lucide-react"
import type { DataColumn } from "@/components/ui/async-data-table"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { StatusDot } from "@/components/ui/status-dot"
import { channelKey, type ReleaseVersion } from "@/lib/domain/admin"
import type { Translate } from "@/lib/i18n/i18n"
import { formatDateTime } from "@/lib/utils/format"

export interface AdminReleaseColumnsHandlers {
  canPromote: boolean
  /** What the promotion makes this version the target of, named in the confirmation. */
  target: string
  promoting: string | undefined
  onPromote: (version: string) => void
}

export function adminReleaseColumns(
  t: Translate,
  { canPromote, target, promoting, onPromote }: AdminReleaseColumnsHandlers
): DataColumn<ReleaseVersion>[] {
  return [
    {
      key: "version",
      header: t("admin.releases.version"),
      cell: (version) => (
        <span className="font-data text-ink">{version.version}</span>
      ),
    },
    {
      key: "channels",
      header: t("admin.servers.channel"),
      width: "w-40",
      cell: (version) => {
        const channels = version.channels
          .map((channel) => {
            const key = channelKey(channel)

            return key ? t(key) : channel
          })
          .join(" · ")

        return (
          <span className="inline-flex items-center gap-2 text-[12px]">
            <StatusDot
              label={channels}
              shape={version.stable ? "filled" : "hollow"}
              tone={version.stable ? "ok" : "muted"}
            />
            {channels}
          </span>
        )
      },
    },
    {
      key: "builds",
      header: t("admin.releases.buildsLabel"),
      width: "w-28",
      align: "end",
      hideBelow: "sm",
      cell: (version) => t.plural("admin.releases.builds", version.builds),
    },
    {
      key: "published_at",
      header: t("admin.releases.publishedAt"),
      width: "w-44",
      align: "end",
      hideBelow: "md",
      cell: (version) => (
        <span className="font-data text-[12px] text-ink-3">
          {formatDateTime(version.publishedAt, t)}
        </span>
      ),
    },
    {
      key: "actions",
      header: t("table.actions"),
      width: "w-44",
      align: "end",
      cell: (version) =>
        canPromote && !version.stable ? (
          <ConfirmDialog
            busy={promoting === version.version}
            busyLabel={t("admin.releases.promoting")}
            confirmLabel={t("admin.releases.promote")}
            description={t("admin.releases.promoteDescription", {
              version: version.version,
              target,
            })}
            onConfirm={() => {
              onPromote(version.version)
            }}
            title={t("admin.releases.promoteTitle")}
            triggerIcon={ArrowUpCircle}
            triggerLabel={t("admin.releases.promote")}
            triggerVariant="secondary"
          />
        ) : null,
    },
  ]
}
