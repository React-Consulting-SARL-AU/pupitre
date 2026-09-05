import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Trash2 } from "lucide-react"
import { Callout } from "@/components/ui/callout"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useTranslations } from "@/hooks/use-locale"
import { usePermission } from "@/hooks/use-permission"
import { deleteServer } from "@/lib/api/queries"

export interface ServerActionsProps {
  serverId: string
  serverName: string
}

export function ServerActions({ serverId, serverName }: ServerActionsProps) {
  const t = useTranslations()
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
        confirmLabel={t("serverActions.delete")}
        description={t("serverActions.deleteDescription", {
          name: serverName,
        })}
        onConfirm={() => {
          remove.mutate()
        }}
        pending={remove.isPending}
        title={t("serverActions.deleteTitle")}
        triggerIcon={Trash2}
        triggerLabel={t("serverActions.deleteServer")}
      />
      {remove.isError ? (
        <Callout
          fix={t("serverActions.deleteFailedFix")}
          title={t("serverActions.deleteFailed")}
          tone="danger"
        />
      ) : null}
    </div>
  )
}
