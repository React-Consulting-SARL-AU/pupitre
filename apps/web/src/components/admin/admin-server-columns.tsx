import { Link } from "@tanstack/react-router"
import type { DataColumn } from "@/components/ui/async-data-table"
import { StatusBadge } from "@/components/ui/status-badge"
import { StatusDot } from "@/components/ui/status-dot"
import { channelKey, suspendedReasonKey } from "@/lib/domain/admin"
import { statusLook } from "@/lib/domain/server-status"
import type { Translate } from "@/lib/i18n/i18n"
import { formatRelative } from "@/lib/utils/format"

export interface AdminServerRowServer {
  id: string
  name: string
  host: string | null
  status: string
  stale: boolean
  seated: boolean
  channel: string
  suspended_reason: string | null
  agent_version: string | null
  last_heartbeat_at: string | Date | null
  organization: { id: string; name: string; slug: string }
}

export function adminServerColumns(
  t: Translate
): DataColumn<AdminServerRowServer>[] {
  return [
    {
      key: "name",
      header: t("admin.servers.title"),
      sortable: true,
      cell: (server) => (
        <>
          <span className="block truncate">{server.name}</span>
          <span className="block truncate font-data text-[12px] text-ink-3">
            {server.host ?? t("servers.unknownHost")}
          </span>
        </>
      ),
    },
    {
      key: "organization",
      header: t("admin.servers.organization"),
      width: "w-40",
      hideBelow: "md",
      cell: (server) => (
        <>
          <Link
            className="block truncate underline-offset-2 hover:underline"
            params={{ id: server.organization.id }}
            to="/dashboard/admin/organizations/$id"
          >
            {server.organization.name}
          </Link>
          <span className="block truncate font-data text-[12px] text-ink-3">
            {server.organization.slug}
          </span>
        </>
      ),
    },
    {
      key: "status",
      header: t("admin.servers.status"),
      width: "w-44",
      cell: (server) => {
        const reason = suspendedReasonKey(server.suspended_reason)

        return (
          <>
            <StatusBadge look={statusLook(server.status, server.stale)} />
            {reason ? (
              <p className="text-[12px] text-ink-3">{t(reason)}</p>
            ) : null}
          </>
        )
      },
    },
    {
      key: "channel",
      header: t("admin.servers.channel"),
      width: "w-28",
      hideBelow: "lg",
      cell: (server) => {
        const key = channelKey(server.channel)

        return (
          <>
            <p className="text-[13px] text-ink-2">
              {key ? t(key) : server.channel}
            </p>
            <p className="font-data text-[12px] text-ink-3">
              {server.agent_version ?? t("format.none")}
            </p>
          </>
        )
      },
    },
    {
      key: "last_heartbeat_at",
      header: t("admin.servers.heartbeat"),
      width: "w-32",
      align: "end",
      sortable: true,
      hideBelow: "md",
      cell: (server) => (
        <span className="text-[12px] text-ink-3">
          {formatRelative(server.last_heartbeat_at, t)}
        </span>
      ),
    },
    {
      key: "seat",
      header: t("admin.servers.seat"),
      width: "w-28",
      hideBelow: "lg",
      cell: (server) => {
        const seat = server.seated
          ? t("admin.servers.seatTaken")
          : t("admin.servers.seatFree")

        return (
          <span className="inline-flex items-center gap-2 text-[12px] text-ink-2">
            <StatusDot
              label={seat}
              shape={server.seated ? "filled" : "hollow"}
              tone={server.seated ? "ok" : "muted"}
            />
            {seat}
          </span>
        )
      },
    },
  ]
}
