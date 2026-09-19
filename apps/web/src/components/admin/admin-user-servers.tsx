import { Link } from "@tanstack/react-router"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/ui/status-badge"
import { useTranslations } from "@/hooks/use-locale"
import type { AdminUserDetail } from "@/lib/api/admin-queries"
import { statusLook } from "@/lib/domain/server-status"

export interface AdminUserServersProps {
  servers: AdminUserDetail["assigned_servers"]
}

export function AdminUserServers({ servers }: AdminUserServersProps) {
  const t = useTranslations()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.users.assignedServers")}</CardTitle>
      </CardHeader>

      {servers.length === 0 ? (
        <CardBody>
          <p className="text-[13px] text-ink-3">
            {t("admin.users.noAssignedServer")}
          </p>
        </CardBody>
      ) : (
        <ul>
          {servers.map((server) => (
            <li
              className="flex flex-wrap items-center gap-4 border-line border-b px-4 py-3 last:border-b-0"
              key={server.id}
            >
              <Link
                className="min-w-0 flex-1 truncate text-[13px] text-ink underline-offset-2 hover:underline"
                params={{ id: server.id }}
                to="/dashboard/admin/servers/$id"
              >
                {server.name}
              </Link>
              <span className="truncate font-data text-[12px] text-ink-3 sm:w-48">
                {server.host ?? t("servers.unknownHost")}
              </span>
              <span className="text-[12px] text-ink-2 sm:w-40">
                {server.organization.name}
              </span>
              <StatusBadge look={statusLook(server.status)} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
