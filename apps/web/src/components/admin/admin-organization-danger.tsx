import { DELETION_GRACE_DAYS } from "@pupitre/shared/platform"
import { useNavigate } from "@tanstack/react-router"
import {
  Ban,
  DoorClosed,
  DoorOpen,
  type LucideIcon,
  RotateCcw,
  Trash2,
} from "lucide-react"
import { Callout } from "@/components/ui/callout"
import { ConfirmFormDialog } from "@/components/ui/confirm-form-dialog"
import { DangerZone, type DangerZoneTone } from "@/components/ui/danger-zone"
import {
  type ConfirmMutationHandle,
  useConfirmMutation,
} from "@/hooks/use-confirm-mutation"
import { useTranslations } from "@/hooks/use-locale"
import {
  type AdminOrganizationDetail,
  closeOrganization,
  deleteOrganization,
  reopenOrganization,
  restoreOrganization,
  suspendOrganization,
} from "@/lib/api/admin-queries"
import { queryKeys } from "@/lib/api/queries"
import {
  isPlatformOrganization,
  type OrganizationGesture,
  organizationGestures,
} from "@/lib/domain/admin"
import type { ConfirmFormValues } from "@/lib/schemas/confirm-form"
import { formatDateTime } from "@/lib/utils/format"

export interface AdminOrganizationDangerProps {
  detail: AdminOrganizationDetail
  acts: boolean
  /** Why every control here is dead for this reader, written on each control. */
  refusedTitle: string | undefined
}

type Handle = ConfirmMutationHandle<ConfirmFormValues>

interface ActCopy {
  label: string
  title: string
  description: string
  icon: LucideIcon
  tone: DangerZoneTone
  busyLabel: string
  reason?: "optional" | "required"
  keyword?: string
}

interface DangerAct extends ActCopy {
  gesture: OrganizationGesture
  handle: Handle
}

function act(
  gesture: OrganizationGesture,
  handle: Handle,
  copy: ActCopy
): DangerAct {
  return { gesture, handle, ...copy }
}

export function AdminOrganizationDanger({
  detail,
  acts,
  refusedTitle,
}: AdminOrganizationDangerProps) {
  const t = useTranslations()
  const navigate = useNavigate()
  const touched = [
    queryKeys.admin.organization(detail.id),
    queryKeys.admin.allOrganizations,
    queryKeys.admin.allServers,
  ]
  const erasing = detail.state === "deleting"
  const name = detail.name

  const suspend = useConfirmMutation<ConfirmFormValues>({
    mutationFn: (values) => suspendOrganization(detail.id, values.reason),
    invalidate: touched,
    done: () => t("admin.organizations.suspendDone", { name }),
    failed: { title: t("admin.organizations.suspendFailed") },
  })
  const restore = useConfirmMutation<ConfirmFormValues>({
    mutationFn: () => restoreOrganization(detail.id),
    invalidate: touched,
    done: () => t("admin.organizations.restoreDone", { name }),
    failed: { title: t("admin.organizations.restoreFailed") },
  })
  const shut = useConfirmMutation<ConfirmFormValues>({
    mutationFn: (values) => closeOrganization(detail.id, values.reason),
    invalidate: touched,
    done: () => t("admin.organizations.closeDone", { name }),
    failed: { title: t("admin.organizations.closeFailed") },
  })
  const reopen = useConfirmMutation<ConfirmFormValues>({
    mutationFn: () => reopenOrganization(detail.id),
    invalidate: touched,
    done: () =>
      erasing
        ? t("admin.organizations.cancelDeletionDone", { name })
        : t("admin.organizations.reopenDone", { name }),
    failed: { title: t("admin.organizations.reopenFailed") },
  })
  const remove = useConfirmMutation<ConfirmFormValues>({
    mutationFn: (values) => deleteOrganization(detail.id, values.reason),
    invalidate: touched,
    done: () =>
      erasing
        ? t("admin.organizations.purgeDone", { name })
        : t("admin.organizations.deleteDone", {
            name,
            days: DELETION_GRACE_DAYS,
          }),
    failed: { title: t("admin.organizations.deleteFailed") },
    onDone: () => {
      if (erasing) {
        navigate({ to: "/dashboard/admin/organizations" })
      }
    },
  })

  if (isPlatformOrganization(detail.id)) {
    return (
      <Callout
        title={t("admin.organizations.platformOrganization")}
        tone="warn"
      />
    )
  }

  const purgeDate = detail.deletion_at
    ? formatDateTime(detail.deletion_at, t)
    : t("format.none")

  const available: Record<OrganizationGesture, DangerAct> = {
    suspend: act("suspend", suspend, {
      label: t("admin.organizations.suspend"),
      title: t("admin.organizations.suspendTitle"),
      description: t("admin.organizations.suspendDescription", { name }),
      icon: Ban,
      tone: "danger",
      busyLabel: t("admin.organizations.suspending"),
      reason: "required",
    }),
    restore: act("restore", restore, {
      label: t("admin.organizations.restore"),
      title: t("admin.organizations.restore"),
      description: t("admin.organizations.restoreDescription", { name }),
      icon: RotateCcw,
      tone: "warning",
      busyLabel: t("admin.organizations.restoring"),
    }),
    close: act("close", shut, {
      label: t("admin.organizations.close"),
      title: t("admin.organizations.closeTitle"),
      description: t("admin.organizations.closeDescription", { name }),
      icon: DoorClosed,
      tone: "danger",
      busyLabel: t("admin.organizations.closing"),
      reason: "required",
    }),
    reopen: act("reopen", reopen, {
      label: t("admin.organizations.reopen"),
      title: t("admin.organizations.reopen"),
      description: t("admin.organizations.reopenDescription", { name }),
      icon: DoorOpen,
      tone: "warning",
      busyLabel: t("admin.organizations.reopening"),
    }),
    cancel_deletion: act("cancel_deletion", reopen, {
      label: t("admin.organizations.cancelDeletion"),
      title: t("admin.organizations.cancelDeletion"),
      description: t("admin.organizations.cancelDeletionDescription", {
        name,
        date: purgeDate,
      }),
      icon: DoorOpen,
      tone: "warning",
      busyLabel: t("admin.organizations.reopening"),
    }),
    delete: act("delete", remove, {
      label: t("admin.organizations.delete"),
      title: t("admin.organizations.deleteTitle"),
      description: t("admin.organizations.deleteDescription", {
        name,
        days: DELETION_GRACE_DAYS,
      }),
      icon: Trash2,
      tone: "danger",
      busyLabel: t("admin.organizations.deletingNow"),
      reason: "required",
      keyword: detail.slug,
    }),
    purge: act("purge", remove, {
      label: t("admin.organizations.purge"),
      title: t("admin.organizations.purgeTitle"),
      description: t("admin.organizations.purgeDescription", { name }),
      icon: Trash2,
      tone: "danger",
      busyLabel: t("admin.organizations.deletingNow"),
      reason: "required",
      keyword: detail.slug,
    }),
  }

  return (
    <div className="flex flex-col gap-gutter">
      {organizationGestures(detail.state).map((gesture) => {
        const one = available[gesture]

        return (
          <DangerZone
            action={
              <ConfirmFormDialog
                busy={one.handle.busy}
                busyLabel={one.busyLabel}
                confirmLabel={one.label}
                description={one.description}
                id={`${one.gesture}-${detail.id}`}
                keyword={one.keyword}
                onConfirm={one.handle.run}
                onOpenChange={(open) => {
                  if (!open) {
                    one.handle.reset()
                  }
                }}
                reason={one.reason}
                reasonLabel={
                  one.reason === "required"
                    ? t("admin.organizations.reason")
                    : undefined
                }
                reasonRequiredMessage={t("admin.organizations.reasonRequired")}
                refusal={one.handle.refusal}
                title={one.title}
                tone={one.tone}
                triggerDisabled={!acts}
                triggerIcon={one.icon}
                triggerLabel={one.label}
                triggerTitle={refusedTitle}
              />
            }
            description={one.description}
            key={one.gesture}
            title={one.label}
            tone={one.tone}
          />
        )
      })}
    </div>
  )
}
