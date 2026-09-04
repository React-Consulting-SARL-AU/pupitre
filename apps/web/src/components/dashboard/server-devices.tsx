import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Callout } from "@/components/ui/callout"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingState } from "@/components/ui/loading-state"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
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
        <CardTitle>Appareils autorisés</CardTitle>
      </CardHeader>

      {mine && devices.isPending ? (
        <LoadingState label="Lecture des appareils autorisés…" />
      ) : null}

      {mine && revoke.isError ? (
        <Callout
          className="m-4"
          fix="Réessayez dans un instant."
          title="Le retrait a échoué."
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
                  {formatRelative(device.last_used_at)}
                </span>
                <ConfirmDialog
                  confirmLabel="Retirer"
                  description={`La clé de « ${device.name} » est retirée de « ${serverName} » au prochain état de l'agent. L'appareil garde ses autres serveurs.`}
                  onConfirm={() => {
                    revoke.mutate(device.id)
                  }}
                  pending={revoke.isPending}
                  title="Retirer cet appareil de ce serveur ?"
                  triggerLabel="Retirer d'ici"
                />
              </div>
            </li>
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
