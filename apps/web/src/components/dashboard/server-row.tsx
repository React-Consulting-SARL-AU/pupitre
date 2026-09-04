import { Link } from "@tanstack/react-router"
import { UsageBar } from "@/components/dashboard/usage-bar"
import { StatusBadge } from "@/components/ui/status-badge"
import { statusLook } from "@/lib/domain/server-status"
import { formatRelative } from "@/lib/utils/format"

export interface ServerRowServer {
  id: string
  name: string
  host: string | null
  port: number
  user: string
  status: string
  stale: boolean
  agent_version: string | null
  last_heartbeat_at: string | null
  usage: { disk: number; ram: number; load: number } | null
}

export interface ServerRowProps {
  server: ServerRowServer
}

export function ServerRow({ server }: ServerRowProps) {
  return (
    <Link
      className="flex flex-wrap items-center gap-6 border-line border-b px-4 py-4 transition-colors duration-[120ms] ease-[ease] last:border-b-0 hover:bg-raised focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
      params={{ id: server.id }}
      to="/dashboard/servers/$id"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-[13px] text-ink">
          {server.name}
        </p>
        <p className="truncate font-data text-[12px] text-ink-3">
          {server.host ?? "hôte inconnu"}
        </p>
      </div>

      <StatusBadge
        className="w-36 shrink-0"
        look={statusLook(server.status, server.stale)}
      />

      <div className="flex shrink-0 flex-col gap-[6px]">
        <UsageBar label="Disque" percent={server.usage?.disk ?? null} />
        <UsageBar label="RAM" percent={server.usage?.ram ?? null} />
      </div>

      <div className="w-24 shrink-0 text-right">
        <p className="font-data text-[12px] text-ink-2 tabular-nums">
          {server.agent_version ?? "—"}
        </p>
        <p className="text-[12px] text-ink-3">
          {formatRelative(server.last_heartbeat_at)}
        </p>
      </div>
    </Link>
  )
}
