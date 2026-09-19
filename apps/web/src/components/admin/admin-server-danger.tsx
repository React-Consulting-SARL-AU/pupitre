import { useNavigate } from "@tanstack/react-router"
import { Ban, RotateCcw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmFormDialog } from "@/components/ui/confirm-form-dialog"
import { DangerZone } from "@/components/ui/danger-zone"
import { useTranslations } from "@/hooks/use-locale"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import { useToast } from "@/hooks/use-toast"
import {
  type AdminServerDetail,
  deleteServer,
  restoreServer,
  suspendServer,
} from "@/lib/api/admin-queries"
import { apiFailure } from "@/lib/api/errors"
import { queryKeys } from "@/lib/api/queries"
import { canRestore, canSuspend } from "@/lib/domain/admin"
import { purgeable, type ServerDeletion } from "@/lib/domain/server-deletion"
import type { Translate } from "@/lib/i18n/i18n"
import { formatDateTime } from "@/lib/utils/format"

export interface AdminServerDangerProps {
  server: AdminServerDetail
}

interface Deletion {
  deletion: ServerDeletion
  reason: string
}

interface DeletionCopy {
  zoneTitle: string
  label: string
  title: string
  description: string
  keyword: string | undefined
  deletion: ServerDeletion
}

/** Revoking and purging are the same control, one step apart: the copy says which one it is. */
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
  const toasts = useToast()
  const navigate = useNavigate()
  const touched = [
    queryKeys.admin.server(server.id),
    queryKeys.admin.allServers,
  ]
  // A refusal belongs in the dialog the reader is still typing in, not in a toast behind it.
  const suspend = useOptimisticMutation<string>({
    mutationFn: (reason) => suspendServer(server.id, reason),
    invalidate: touched,
    onDone: () => {
      toasts.done(t("admin.servers.suspended", { name: server.name }))
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
  // The purge leaves the page at the click, as the owner's does: no line is left to look at.
  const remove = useOptimisticMutation<Deletion>({
    mutationFn: ({ reason }) => deleteServer(server.id, reason),
    invalidate: touched,
    onStart: ({ deletion }) => {
      if (deletion === "purge") {
        navigate({ to: "/dashboard/admin/servers" })
      }
    },
    onDone: (_data, { deletion }) => {
      toasts.done(
        t(
          deletion === "purge"
            ? "admin.servers.purged"
            : "admin.servers.deleted",
          { name: server.name }
        )
      )
    },
  })
  const deletion = deletionCopy(server, t)

  return (
    <div className="flex flex-col gap-gutter">
      {canSuspend(server.status) ? (
        <DangerZone
          action={
            <ConfirmFormDialog
              busy={suspend.isPending}
              busyLabel={t("admin.servers.suspending")}
              confirmLabel={t("admin.servers.suspend")}
              description={t("admin.servers.suspendDescription", {
                name: server.name,
                organization: server.organization.name,
              })}
              id={`suspend-${server.id}`}
              onConfirm={(values) => {
                suspend.mutate(values.reason)
              }}
              reason="required"
              reasonLabel={t("admin.servers.reason")}
              reasonRequiredMessage={t("admin.servers.reasonRequired")}
              refusal={apiFailure(suspend.error)}
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

      {canRestore(server.suspended_reason) ? (
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
            busy={remove.isPending}
            busyLabel={t("admin.servers.deleting")}
            confirmLabel={deletion.label}
            description={deletion.description}
            id={`delete-${server.id}`}
            keyword={deletion.keyword}
            onConfirm={(values) => {
              remove.mutate({
                deletion: deletion.deletion,
                reason: values.reason,
              })
            }}
            reason="required"
            reasonLabel={t("admin.servers.reason")}
            reasonRequiredMessage={t("admin.servers.reasonRequired")}
            refusal={apiFailure(remove.error)}
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
