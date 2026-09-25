import { useNavigate } from "@tanstack/react-router"
import { Ban, RotateCcw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmFormDialog } from "@/components/ui/confirm-form-dialog"
import { DangerZone } from "@/components/ui/danger-zone"
import { useConfirmMutation } from "@/hooks/use-confirm-mutation"
import { useTranslations } from "@/hooks/use-locale"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import {
  type AdminServerDetail,
  deleteServer,
  restoreServer,
  suspendServer,
} from "@/lib/api/admin-queries"
import { queryKeys } from "@/lib/api/queries"
import { purgeable, type ServerDeletion } from "@/lib/domain/server-deletion"
import type { Translate } from "@/lib/i18n/i18n"
import type { ConfirmFormValues } from "@/lib/schemas/confirm-form"
import { formatDateTime } from "@/lib/utils/format"

export interface AdminServerDangerProps {
  server: AdminServerDetail
}

interface DeletionCopy {
  zoneTitle: string
  label: string
  title: string
  description: string
  keyword: string | undefined
  deletion: ServerDeletion
}

function deletionCopy(server: AdminServerDetail, t: Translate): DeletionCopy {
  if (purgeable(server.status)) {
    return {
      zoneTitle: t("admin.servers.purgeZoneTitle"),
      label: t("admin.servers.purge"),
      title: t("admin.servers.purgeTitle"),
      description: t("admin.servers.purgeDescription", {
        name: server.name,
        date: server.decommission_at
          ? formatDateTime(server.decommission_at, t)
          : t("format.none"),
      }),
      keyword: server.name,
      deletion: "purge",
    }
  }

  return {
    zoneTitle: t("admin.servers.deleteZoneTitle"),
    label: t("admin.servers.delete"),
    title: t("admin.servers.deleteTitle"),
    description: t("admin.servers.deleteDescription", {
      name: server.name,
      organization: server.organization.name,
    }),
    keyword: undefined,
    deletion: "revoke",
  }
}

export function AdminServerDanger({ server }: AdminServerDangerProps) {
  const t = useTranslations()
  const navigate = useNavigate()
  const touched = [
    queryKeys.admin.server(server.id),
    queryKeys.admin.allServers,
  ]
  const deletion = deletionCopy(server, t)
  const allowed = new Set(server.allowed_actions)
  const suspend = useConfirmMutation<ConfirmFormValues>({
    mutationFn: (values) => suspendServer(server.id, values.reason),
    invalidate: touched,
    done: () => t("admin.servers.suspended", { name: server.name }),
    failed: {
      title: t("admin.servers.suspendFailed"),
      fix: t("admin.servers.suspendFailedFix"),
    },
  })
  const restore = useOptimisticMutation({
    mutationFn: () => restoreServer(server.id),
    invalidate: touched,
    toast: {
      failed: () => ({
        title: t("admin.servers.restoreFailed"),
        fix: t("admin.servers.restoreFailedFix"),
      }),
    },
  })
  const remove = useConfirmMutation<ConfirmFormValues>({
    mutationFn: (values) => deleteServer(server.id, values.reason),
    invalidate: touched,
    done: () =>
      t(
        deletion.deletion === "purge"
          ? "admin.servers.purged"
          : "admin.servers.deleted",
        { name: server.name }
      ),
    failed: {
      title: t("admin.servers.deleteFailed"),
      fix: t("common.retryLater"),
    },
    onDone: () => {
      if (deletion.deletion === "purge") {
        navigate({ to: "/dashboard/admin/servers" })
      }
    },
  })

  return (
    <div className="flex flex-col gap-gutter">
      {allowed.has("suspend") ? (
        <DangerZone
          action={
            <ConfirmFormDialog
              busy={suspend.busy}
              busyLabel={t("admin.servers.suspending")}
              confirmLabel={t("admin.servers.suspend")}
              description={t("admin.servers.suspendDescription", {
                name: server.name,
                organization: server.organization.name,
              })}
              id={`suspend-${server.id}`}
              onConfirm={suspend.run}
              onOpenChange={(open) => {
                if (!open) {
                  suspend.reset()
                }
              }}
              reason="required"
              reasonLabel={t("admin.servers.reason")}
              reasonRequiredMessage={t("admin.servers.reasonRequired")}
              refusal={suspend.refusal}
              title={t("admin.servers.suspendTitle")}
              tone="warning"
              triggerIcon={Ban}
              triggerLabel={t("admin.servers.suspend")}
            />
          }
          description={t("admin.servers.suspendDescription", {
            name: server.name,
            organization: server.organization.name,
          })}
          title={t("admin.servers.suspendZoneTitle")}
          tone="warning"
        />
      ) : null}

      {allowed.has("restore") ? (
        <DangerZone
          action={
            <Button
              icon={RotateCcw}
              loading={restore.isPending}
              onClick={() => {
                restore.mutate(undefined)
              }}
              size="sm"
            >
              {t("admin.servers.restore")}
            </Button>
          }
          description={t("admin.servers.restoreDescription", {
            name: server.name,
            organization: server.organization.name,
          })}
          title={t("admin.servers.restoreZoneTitle")}
          tone="warning"
        />
      ) : null}

      <DangerZone
        action={
          <ConfirmFormDialog
            busy={remove.busy}
            busyLabel={t("admin.servers.deleting")}
            confirmLabel={deletion.label}
            description={deletion.description}
            id={`delete-${server.id}`}
            keyword={deletion.keyword}
            onConfirm={remove.run}
            onOpenChange={(open) => {
              if (!open) {
                remove.reset()
              }
            }}
            reason="required"
            reasonLabel={t("admin.servers.reason")}
            reasonRequiredMessage={t("admin.servers.reasonRequired")}
            refusal={remove.refusal}
            title={deletion.title}
            triggerIcon={Trash2}
            triggerLabel={deletion.label}
          />
        }
        description={deletion.description}
        title={deletion.zoneTitle}
      />
    </div>
  )
}
