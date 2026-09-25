import { useQuery } from "@tanstack/react-query"
import { RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { SkeletonLines } from "@/components/ui/skeleton"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import {
  devicesQueryOptions,
  queryKeys,
  revokeServerDevice,
} from "@/lib/api/queries"
import { formatRelative } from "@/lib/utils/format"

export interface ServerDevicesProps {
  serverId: string
  serverName: string
  assignedUserId: string | null
}

interface RevokeTarget {
  id: string
  name: string
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
  // The revocation touches this server alone and returns nothing: only the server's log moves.
  const revoke = useOptimisticMutation<RevokeTarget, void>({
    mutationFn: ({ id }) => revokeServerDevice(serverId, id),
    invalidate: [queryKeys.server(serverId)],
    toast: {
      done: (_data, target) =>
        t("servers.devices.removed", {
          device: target.name,
          server: serverName,
        }),
      failed: () => ({
        title: t("servers.devices.revokeFailed"),
        fix: t("common.retryLater"),
      }),
    },
  })
  const revoking = revoke.isPending ? revoke.variables?.id : undefined
  const list = devices.data ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("servers.devices.title")}</CardTitle>
      </CardHeader>

      {mine && devices.isPending ? (
        <SkeletonLines label={t("servers.devices.reading")} rows={2} />
      ) : null}

      {mine && devices.isError ? (
        <CardBody>
          <Callout
            action={
              <Button
                icon={RotateCw}
                loading={devices.isFetching}
                onClick={() => {
                  devices.refetch()
                }}
                size="sm"
              >
                {t("common.retry")}
              </Button>
            }
            fix={t("servers.devices.readFailedFix")}
            title={t("servers.devices.readFailed")}
            tone="danger"
          />
        </CardBody>
      ) : null}

      {mine && devices.isSuccess && list.length > 0 ? (
        <ul>
          {list.map((device) => (
            <li
              aria-busy={revoking === device.id || undefined}
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
                  busy={revoking === device.id}
                  busyLabel={t("servers.devices.removing")}
                  confirmLabel={t("servers.devices.remove")}
                  description={t("servers.devices.removeDescription", {
                    device: device.name,
                    server: serverName,
                  })}
                  onConfirm={() => {
                    revoke.mutate({ id: device.id, name: device.name })
                  }}
                  title={t("servers.devices.removeTitle")}
                  triggerLabel={t("servers.devices.removeHere")}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {mine && devices.isSuccess && list.length === 0 ? (
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
