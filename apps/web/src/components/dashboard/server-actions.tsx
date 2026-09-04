import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Trash2 } from "lucide-react"
import { Callout } from "@/components/ui/callout"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { usePermission } from "@/hooks/use-permission"
import { deleteServer } from "@/lib/api/queries"

export interface ServerActionsProps {
  serverId: string
  serverName: string
}

export function ServerActions({ serverId, serverName }: ServerActionsProps) {
  const canManage = usePermission("servers:manage")
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: () => deleteServer(serverId),
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      await navigate({ to: "/dashboard/servers" })
    },
  })

  if (!canManage) {
    return null
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <ConfirmDialog
        confirmLabel="Supprimer"
        description={`« ${serverName} » passe en révoqué : l'attribution et les clés tombent tout de suite, la décommission est programmée à sept jours.`}
        onConfirm={() => {
          remove.mutate()
        }}
        pending={remove.isPending}
        title="Supprimer ce serveur ?"
        triggerIcon={Trash2}
        triggerLabel="Supprimer le serveur"
      />
      {remove.isError ? (
        <Callout
          fix="Réessayez ; si cela persiste, vérifiez votre rôle dans l'organisation."
          title="La suppression a échoué."
          tone="danger"
        />
      ) : null}
    </div>
  )
}
