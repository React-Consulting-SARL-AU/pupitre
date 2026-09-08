import { Link } from "@tanstack/react-router"
import { Trash2 } from "lucide-react"
import type { CSSProperties } from "react"
import { UsageBar } from "@/components/dashboard/usage-bar"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { StatusBadge } from "@/components/ui/status-badge"
import { StatusDot } from "@/components/ui/status-dot"
import { useTranslations } from "@/hooks/use-locale"
import { alertLook } from "@/lib/domain/alerts"
import { statusLook } from "@/lib/domain/server-status"
import { formatDateTime, formatRelative } from "@/lib/utils/format"

export interface ServerRowServer {
  id: string
  name: string
  host: string | null
  port: number
  user: string
  status: string
  stale: boolean
  decommission_at: string | null
  agent_version: string | null
  last_heartbeat_at: string | null
  usage: { disk: number; ram: number; load: number } | null
  alerts: { kind: string }[]
}

export interface ServerRowProps {
  server: ServerRowServer
  index: number
  purgeable: boolean
  purging: boolean
  onPurge: () => void
}

/** Past the eighth, a row arrives with the eighth: the cascade must not outlast the read. */
const LAST_STAGGERED = 8

export function ServerRow({
  server,
  index,
  purgeable,
  purging,
  onPurge,
}: ServerRowProps) {
  const t = useTranslations()

  return (
    <div
      aria-busy={purging || undefined}
      className="flex animate-enter items-center border-line border-b transition-fast last:border-b-0 hover:bg-raised"
      style={{ "--stagger": Math.min(index, LAST_STAGGERED) } as CSSProperties}
    >
      <Link
        className="flex min-w-0 flex-1 flex-wrap items-center gap-4 px-4 py-4 focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-[-2px] sm:gap-6"
        params={{ id: server.id }}
        to="/dashboard/servers/$id"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-[13px] text-ink">
            {server.name}
          </p>
          <p className="truncate font-data text-[12px] text-ink-3">
            {server.host ?? t("servers.unknownHost")}
          </p>
          {server.decommission_at ? (
            <p className="truncate text-[12px] text-ink-3">
              {t("servers.decommissionOn", {
                date: formatDateTime(server.decommission_at, t),
              })}
            </p>
          ) : null}
        </div>

        <StatusBadge
          className="shrink-0 sm:w-36"
          look={statusLook(server.status, server.stale)}
        />

        <span
          className="hidden w-16 shrink-0 items-center gap-1 sm:flex"
          data-testid="server-row-alerts"
        >
          {server.alerts.map((alert) => {
            const look = alertLook(alert.kind)

            return (
              <StatusDot
                key={alert.kind}
                label={t(look.label)}
                shape={look.shape}
                tone={look.tone}
              />
            )
          })}
        </span>

        <div className="hidden shrink-0 flex-col gap-[6px] lg:flex">
          <UsageBar
            label={t("servers.disk")}
            percent={server.usage?.disk ?? null}
          />
          <UsageBar
            label={t("servers.ram")}
            percent={server.usage?.ram ?? null}
          />
        </div>

        <div className="hidden w-24 shrink-0 text-right sm:block">
          <p className="font-data text-[12px] text-ink-2 tabular-nums">
            {server.agent_version ?? t("format.none")}
          </p>
          <p className="text-[12px] text-ink-3">
            {formatRelative(server.last_heartbeat_at, t)}
          </p>
        </div>
      </Link>

      {purgeable ? (
        <div className="shrink-0 pr-4 pl-2">
          <ConfirmDialog
            busy={purging}
            busyLabel={t("serverActions.deleting")}
            confirmLabel={t("serverActions.purge")}
            description={t("serverActions.purgeDescription", {
              date: server.decommission_at
                ? formatDateTime(server.decommission_at, t)
                : t("format.none"),
              name: server.name,
            })}
            onConfirm={onPurge}
            title={t("serverActions.purgeTitle")}
            triggerIcon={Trash2}
            triggerIconOnly
            triggerLabel={t("serverActions.purgeServer")}
          />
        </div>
      ) : null}
    </div>
  )
}
