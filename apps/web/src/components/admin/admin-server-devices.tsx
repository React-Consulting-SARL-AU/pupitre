import { Link } from "@tanstack/react-router"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslations } from "@/hooks/use-locale"
import type { AdminServerDetail } from "@/lib/api/admin-queries"
import { formatDateTime } from "@/lib/utils/format"

export interface AdminServerDevicesProps {
  server: AdminServerDetail
}

export function AdminServerDevices({ server }: AdminServerDevicesProps) {
  const t = useTranslations()
  const revocations = server.revoked_devices

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.servers.revokedDevices")}</CardTitle>
      </CardHeader>

      {revocations.length === 0 ? (
        <CardBody>
          <p className="text-[13px] text-ink-3">
            {t("admin.servers.noRevokedDevice")}
          </p>
        </CardBody>
      ) : (
        <ul>
          {revocations.map((revocation) => (
            <li
              className="flex flex-wrap items-center gap-4 border-line border-b px-4 py-3 last:border-b-0"
              key={revocation.device.id}
            >
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                {revocation.device.name}
              </span>
              <Link
                className="truncate text-[12px] text-ink-2 underline-offset-2 hover:underline sm:w-56"
                params={{ id: revocation.device.user.id }}
                to="/dashboard/admin/users/$id"
              >
                {revocation.device.user.email}
              </Link>
              <span className="truncate text-[12px] text-ink-2 sm:w-56">
                {`${t("admin.servers.revokedBy")} ${revocation.revoked_by?.email ?? t("format.none")}`}
              </span>
              <span className="font-data text-[12px] text-ink-3 tabular-nums">
                {formatDateTime(revocation.revoked_at, t)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
