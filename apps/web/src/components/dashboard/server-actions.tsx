import { useNavigate } from "@tanstack/react-router"
import { Trash2 } from "lucide-react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useTranslations } from "@/hooks/use-locale"
import {
  patchQuery,
  useOptimisticMutation,
} from "@/hooks/use-optimistic-mutation"
import { usePermission } from "@/hooks/use-permission"
import {
  deleteServer,
  queryKeys,
  type ServerDetail,
  type ServerSummary,
} from "@/lib/api/queries"
import { deletionLook, type ServerDeletion } from "@/lib/domain/server-deletion"
import { formatDateTime } from "@/lib/utils/format"

export interface ServerActionsProps {
  serverId: string
  serverName: string
  status: string
  decommissionAt: string | null
}

const REVOKED = "revoked"

// The deletion step rides on the call: the optimistic patch already shows the server revoked.
export function ServerActions({
  serverId,
  serverName,
  status,
  decommissionAt,
}: ServerActionsProps) {
  const t = useTranslations()
  const look = deletionLook(status)
  const canManage = usePermission("servers:manage")
  const navigate = useNavigate()

  const remove = useOptimisticMutation<ServerDeletion, void>({
    mutationFn: () => deleteServer(serverId),
    patch: [
      patchQuery<ServerSummary[], ServerDeletion>(
        queryKeys.servers,
        (servers, deletion) =>
          deletion === "purge"
            ? servers.filter((server) => server.id !== serverId)
            : servers.map((server) =>
                server.id === serverId ? { ...server, status: REVOKED } : server
              )
      ),
      patchQuery<ServerDetail, ServerDeletion>(
        queryKeys.server(serverId),
        (detail, deletion) =>
          deletion === "purge" ? detail : { ...detail, status: REVOKED }
      ),
    ],
    invalidate: [queryKeys.servers, queryKeys.server(serverId), queryKeys.me],
    onStart: (deletion) => {
      if (deletion === "purge") {
        navigate({ to: "/dashboard/servers" })
      }
    },
    toast: {
      done: (_data, deletion) =>
        t(
          deletion === "purge"
            ? "serverActions.purged"
            : "serverActions.revoked",
          { name: serverName }
        ),
      failed: (deletion) => ({
        title: t("serverActions.deleteFailed"),
        fix: t("serverActions.deleteFailedFix"),
        ...(deletion === "purge"
          ? {
              action: {
                label: t("serverActions.reopen"),
                run: () => {
                  navigate({
                    to: "/dashboard/servers/$id",
                    params: { id: serverId },
                  })
                },
              },
            }
          : {}),
      }),
    },
  })

  if (!canManage) {
    return null
  }

  return (
    <ConfirmDialog
      busy={remove.isPending}
      busyLabel={t("serverActions.deleting")}
      confirmLabel={t(look.confirm)}
      description={t(look.description, {
        date: decommissionAt
          ? formatDateTime(decommissionAt, t)
          : t("format.none"),
        name: serverName,
      })}
      onConfirm={() => {
        remove.mutate(look.deletion)
      }}
      title={t(look.title)}
      triggerIcon={Trash2}
      triggerLabel={t(look.trigger)}
    />
  )
}
