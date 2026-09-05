import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Laptop } from "lucide-react"
import { DeviceRow } from "@/components/dashboard/device-row"
import { Callout } from "@/components/ui/callout"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { useTranslations } from "@/hooks/use-locale"
import { deleteDevice, devicesQueryOptions } from "@/lib/api/queries"

export function DeviceList() {
  const t = useTranslations()
  const devices = useQuery(devicesQueryOptions())
  const queryClient = useQueryClient()
  const revoke = useMutation({
    mutationFn: deleteDevice,
    onSuccess: () => queryClient.invalidateQueries(),
  })

  if (devices.isPending) {
    return <LoadingState label={t("deviceList.reading")} />
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
      {revoke.isError ? (
        <Callout
          className="m-4"
          fix={t("deviceList.revokeFailedFix")}
          title={t("deviceList.revokeFailed")}
          tone="danger"
        />
      ) : null}
      <ul>
        {devices.data.map((device) => (
          <DeviceRow
            device={device}
            key={device.id}
            onRevoke={(id) => {
              revoke.mutate(id)
            }}
            pending={revoke.isPending}
          />
        ))}
      </ul>
    </div>
  )
}
