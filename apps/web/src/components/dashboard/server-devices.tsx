import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { DeviceRow } from "@/components/dashboard/device-row"
import { Callout } from "@/components/ui/callout"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingState } from "@/components/ui/loading-state"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { deleteDevice, devicesQueryOptions } from "@/lib/api/queries"

export interface ServerDevicesProps {
  assignedUserId: string | null
}

export function ServerDevices({ assignedUserId }: ServerDevicesProps) {
  const { user } = useDashboardContext()
  const mine = assignedUserId === user.id
  const devices = useQuery({ ...devicesQueryOptions(), enabled: mine })
  const queryClient = useQueryClient()
  const revoke = useMutation({
    mutationFn: deleteDevice,
    onSuccess: () => queryClient.invalidateQueries(),
  })
  const list = devices.data ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appareils autorisés</CardTitle>
      </CardHeader>

      {mine && devices.isPending ? (
        <LoadingState label="Lecture des appareils autorisés…" />
      ) : null}

      {mine && revoke.isError ? (
        <Callout
          className="m-4"
          fix="Réessayez dans un instant."
          title="La révocation a échoué."
          tone="danger"
        />
      ) : null}

      {mine && !devices.isPending && list.length > 0 ? (
        <ul>
          {list.map((device) => (
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
      ) : null}

      {mine && !devices.isPending && list.length === 0 ? (
        <CardBody>
          <p className="text-[13px] text-ink-3">
            Aucun appareil : ajoutez-en un depuis l'app pour ouvrir ce serveur.
          </p>
        </CardBody>
      ) : null}

      {mine ? null : (
        <CardBody>
          <p className="text-[13px] text-ink-3">
            {assignedUserId
              ? "Ce serveur est attribué à un autre membre : ses appareils lui appartiennent."
              : "Ce serveur n'est attribué à personne : aucune clé n'y est déposée."}
          </p>
        </CardBody>
      )}
    </Card>
  )
}
