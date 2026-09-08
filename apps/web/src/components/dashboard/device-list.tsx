import { useQuery } from "@tanstack/react-query"
import { Laptop } from "lucide-react"
import { DeviceRow } from "@/components/dashboard/device-row"
import { Callout } from "@/components/ui/callout"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonRows } from "@/components/ui/skeleton"
import { useTranslations } from "@/hooks/use-locale"
import {
  patchQuery,
  useOptimisticMutation,
} from "@/hooks/use-optimistic-mutation"
import {
  type Device,
  deleteDevice,
  devicesQueryOptions,
  queryKeys,
} from "@/lib/api/queries"

interface RevokeTarget {
  id: string
  name: string
}

export function DeviceList() {
  const t = useTranslations()
  const devices = useQuery(devicesQueryOptions())

  const revoke = useOptimisticMutation<RevokeTarget, void>({
    mutationFn: ({ id }) => deleteDevice(id),
    patch: [
      patchQuery<Device[], RevokeTarget>(queryKeys.devices, (list, target) =>
        list.filter((device) => device.id !== target.id)
      ),
    ],
    invalidate: [queryKeys.devices],
    toast: {
      done: (_data, target) => t("deviceList.revoked", { name: target.name }),
      failed: () => ({
        title: t("deviceList.revokeFailed"),
        fix: t("deviceList.revokeFailedFix"),
      }),
    },
  })
  const revoking = revoke.isPending ? revoke.variables?.id : undefined

  if (devices.isPending) {
    return <SkeletonRows />
  }

  if (devices.isError) {
    return (
      <Callout
        fix={t("deviceList.failedFix")}
        title={t("deviceList.failed")}
        tone="danger"
      />
    )
  }

  if (devices.data.length === 0) {
    return (
      <EmptyState
        description={t("deviceList.emptyDescription")}
        icon={Laptop}
        title={t("deviceList.emptyTitle")}
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-md bg-surface shadow-raised">
      <ul>
        {devices.data.map((device) => (
          <DeviceRow
            device={device}
            key={device.id}
            onRevoke={() => {
              revoke.mutate({ id: device.id, name: device.name })
            }}
            revoking={revoking === device.id}
          />
        ))}
      </ul>
    </div>
  )
}
