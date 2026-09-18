import { Link } from "@tanstack/react-router"
import { AdminSuspendDialog } from "@/components/admin/admin-suspend-dialog"
import { StatusBadge } from "@/components/ui/status-badge"
import { useTranslations } from "@/hooks/use-locale"
import { canSuspend, suspendedReasonKey } from "@/lib/domain/admin"
import { statusLook } from "@/lib/domain/server-status"
import { formatRelative } from "@/lib/utils/format"

export interface AdminServerRowServer {
  id: string
  name: string
  host: string | null
  status: string
  stale: boolean
  suspended_reason: string | null
  agent_version: string | null
  last_heartbeat_at: string | null
  organization: { id: string; name: string; slug: string }
}

export interface AdminServerRowProps {
  server: AdminServerRowServer
  suspending: boolean
  canAct: boolean
  onSuspend: (reason: string) => void
}

export function AdminServerRow({
  server,
  suspending,
  canAct,
  onSuspend,
}: AdminServerRowProps) {
  const t = useTranslations()
  const reason = suspendedReasonKey(server.suspended_reason)

  return (
    <li
      aria-busy={suspending || undefined}
      className="flex flex-wrap items-center gap-4 border-line border-b px-4 py-3 last:border-b-0 sm:gap-6"
    >
      <div className="min-w-0 flex-1">
        <Link
          className="block truncate font-medium text-[13px] text-ink underline-offset-2 hover:underline"
          params={{ id: server.id }}
          to="/dashboard/admin/servers/$id"
        >
          {server.name}
        </Link>
        <p className="truncate font-data text-[12px] text-ink-3">
          {server.host ?? t("servers.unknownHost")}
        </p>
      </div>

      <div className="min-w-0 sm:w-40">
        <Link
          className="block truncate text-[13px] text-ink-2 underline-offset-2 hover:underline"
          params={{ id: server.organization.id }}
          to="/dashboard/admin/organizations/$id"
        >
          {server.organization.name}
        </Link>
        <p className="truncate font-data text-[12px] text-ink-3">
          {server.organization.slug}
        </p>
      </div>

      <div className="flex flex-col gap-1 sm:w-44">
        <StatusBadge look={statusLook(server.status, server.stale)} />
        {reason ? <p className="text-[12px] text-ink-3">{t(reason)}</p> : null}
      </div>

      <div className="w-24 text-right">
        <p className="font-data text-[12px] text-ink-2 tabular-nums">
          {server.agent_version ?? t("format.none")}
        </p>
        <p className="text-[12px] text-ink-3">
          {formatRelative(server.last_heartbeat_at, t)}
        </p>
      </div>

      <div className="w-28 text-right">
        {canAct && canSuspend(server.status) ? (
          <AdminSuspendDialog
            busy={suspending}
            onConfirm={onSuspend}
            server={server}
          />
        ) : null}
      </div>
    </li>
  )
}
