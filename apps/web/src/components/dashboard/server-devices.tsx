import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Callout } from "@/components/ui/callout"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingState } from "@/components/ui/loading-state"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { devicesQueryOptions, revokeServerDevice } from "@/lib/api/queries"
import { formatRelative } from "@/lib/utils/format"

export interface ServerDevicesProps {
  serverId: string
  serverName: string
  assignedUserId: string | null
}

export function ServerDevices({
  serverId,
  serverName,
  assignedUserId,
}: ServerDevicesProps) {
  const t = useTranslations()
  const { user } = useDashboardContext()
  const mine = assignedUserId === user.id
  const devices = useQuery({ ...devicesQueryOptions(), enabled: mine })
  const queryClient = useQueryClient()
  const revoke = useMutation({
    mutationFn: (deviceId: string) => revokeServerDevice(serverId, deviceId),
    onSuccess: () => queryClient.invalidateQueries(),
  })
  const list = devices.data ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("servers.devices.title")}</CardTitle>
      </CardHeader>

      {mine && devices.isPending ? (
        <LoadingState label={t("servers.devices.reading")} />
      ) : null}

      {mine && revoke.isError ? (
        <Callout
          className="m-4"
          fix={t("servers.devices.revokeFailedFix")}
          title={t("servers.devices.revokeFailed")}
          tone="danger"
        />
      ) : null}

      {mine && !devices.isPending && list.length > 0 ? (
        <ul>
          {list.map((device) => (
            <li
              className="flex flex-wrap items-center justify-between gap-4 border-line border-b px-4 py-3 last:border-b-0"
              key={device.id}
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-[13px] text-ink">
                  {device.name}
                </p>
                <p className="truncate font-data text-[12px] text-ink-3">
                  {device.fingerprint}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[12px] text-ink-3">
                  {formatRelative(device.last_used_at, t)}
                </span>
                <ConfirmDialog
                  confirmLabel={t("servers.devices.remove")}
                  description={t("servers.devices.removeDescription", {
                    device: device.name,
                    server: serverName,
                  })}
                  onConfirm={() => {
                    revoke.mutate(device.id)
                  }}
                  pending={revoke.isPending}
                  title={t("servers.devices.removeTitle")}
                  triggerLabel={t("servers.devices.removeHere")}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {mine && !devices.isPending && list.length === 0 ? (
        <CardBody>
          <p className="text-[13px] text-ink-3">{t("servers.devices.empty")}</p>
        </CardBody>
      ) : null}

      {mine ? null : (
        <CardBody>
          <p className="text-[13px] text-ink-3">
            {assignedUserId
              ? t("servers.devices.otherMember")
              : t("servers.devices.unassigned")}
          </p>
        </CardBody>
      )}
    </Card>
  )
}
