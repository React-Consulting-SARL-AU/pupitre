import { Link } from "@tanstack/react-router"
import { Ban } from "lucide-react"
import type { DataColumn } from "@/components/ui/async-data-table"
import { ConfirmFormDialog } from "@/components/ui/confirm-form-dialog"
import { StatusBadge } from "@/components/ui/status-badge"
import { canSuspend, suspendedReasonKey } from "@/lib/domain/admin"
import { statusLook } from "@/lib/domain/server-status"
import type { Translate } from "@/lib/i18n/i18n"
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

export interface AdminServerColumnsHandlers {
  canAct: boolean
  /** The identifier of the server the platform is suspending right now, if any. */
  suspending: string | undefined
  onSuspend: (server: AdminServerRowServer, reason: string) => void
}

export function adminServerColumns(
  t: Translate,
  { canAct, suspending, onSuspend }: AdminServerColumnsHandlers
): DataColumn<AdminServerRowServer>[] {
  return [
    {
      key: "name",
      header: t("admin.servers.title"),
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
      key: "agent",
      header: t("admin.servers.channel"),
      width: "w-24",
      align: "end",
      hideBelow: "lg",
      cell: (server) => (
        <>
          <p className="font-data text-[12px] text-ink-2">
            {server.agent_version ?? t("format.none")}
          </p>
          <p className="text-[12px] text-ink-3">
            {formatRelative(server.last_heartbeat_at, t)}
          </p>
        </>
      ),
    },
    {
      key: "actions",
      header: t("table.actions"),
      width: "w-32",
      align: "end",
      cell: (server) =>
        canAct && canSuspend(server.status) ? (
          <ConfirmFormDialog
            busy={suspending === server.id}
            busyLabel={t("admin.servers.suspending")}
            confirmLabel={t("admin.servers.suspend")}
            description={t("admin.servers.suspendDescription", {
              name: server.name,
              organization: server.organization.name,
            })}
            id={`suspend-${server.id}`}
            onConfirm={(values) => {
              onSuspend(server, values.reason)
            }}
            reason="required"
            reasonLabel={t("admin.servers.reason")}
            title={t("admin.servers.suspendTitle")}
            triggerIcon={Ban}
            triggerLabel={t("admin.servers.suspend")}
          />
        ) : null,
    },
  ]
}
