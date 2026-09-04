import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Laptop } from "lucide-react"
import { DeviceRow } from "@/components/dashboard/device-row"
import { Callout } from "@/components/ui/callout"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { deleteDevice, devicesQueryOptions } from "@/lib/api/queries"

export function DeviceList() {
  const devices = useQuery(devicesQueryOptions())
  const queryClient = useQueryClient()
  const revoke = useMutation({
    mutationFn: deleteDevice,
    onSuccess: () => queryClient.invalidateQueries(),
  })

  if (devices.isPending) {
    return <LoadingState label="Lecture de vos appareils…" />
  }

  if (devices.isError) {
    return (
      <Callout
        fix="Rechargez la page ; si cela persiste, reconnectez-vous."
        title="Vos appareils n'ont pas pu être lus."
        tone="danger"
      />
    )
  }

  if (devices.data.length === 0) {
    return (
      <EmptyState
        description="L'app Pupitre enregistre votre appareil à sa première connexion : sa clé reste sur votre machine, seule la partie publique arrive ici."
        icon={Laptop}
        title="Aucun appareil enregistré"
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-md bg-surface shadow-raised">
      {revoke.isError ? (
        <Callout
          className="m-4"
          fix="Réessayez dans un instant."
          title="La révocation a échoué."
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
