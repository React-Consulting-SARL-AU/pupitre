import { Link } from "@tanstack/react-router"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/ui/status-badge"
import { useTranslations } from "@/hooks/use-locale"
import type { AdminOrganizationDetail } from "@/lib/api/admin-queries"
import { suspendedReasonKey } from "@/lib/domain/admin"
import { statusLook } from "@/lib/domain/server-status"

export interface AdminOrganizationServersProps {
  servers: AdminOrganizationDetail["servers"]
}

export function AdminOrganizationServers({
  servers,
}: AdminOrganizationServersProps) {
  const t = useTranslations()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.organizations.servers")}</CardTitle>
      </CardHeader>

      {servers.length === 0 ? (
        <CardBody>
          <p className="text-[13px] text-ink-3">
            {t("admin.organizations.noServer")}
          </p>
        </CardBody>
      ) : (
        <ul>
          {servers.map((server) => {
            const reason = suspendedReasonKey(server.suspended_reason)

            return (
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
                <span className="min-w-0 truncate font-data text-[12px] text-ink-3 sm:w-56">
                  {server.host ?? t("servers.unknownHost")}
                </span>
                <span className="text-[12px] text-ink-2 sm:w-48">
                  {reason ? t(reason) : t("format.none")}
                </span>
                <StatusBadge look={statusLook(server.status, server.stale)} />
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
