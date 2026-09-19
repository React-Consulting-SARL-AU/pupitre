import { DELETION_GRACE_DAYS } from "@pupitre/shared/platform"
import { useNavigate } from "@tanstack/react-router"
import {
  Ban,
  LogOut,
  type LucideIcon,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserMinus,
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
  type AdminUserDetail,
  banUser,
  deactivateUser,
  deleteUser,
  reactivateUser,
  revokeUserSessions,
  unbanUser,
} from "@/lib/api/admin-queries"
import { queryKeys } from "@/lib/api/queries"
import { type AccountGesture, accountGestures } from "@/lib/domain/admin"
import type { ConfirmFormValues } from "@/lib/schemas/confirm-form"
import { formatDateTime } from "@/lib/utils/format"

export interface AdminUserDangerProps {
  detail: AdminUserDetail
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
  until?: boolean
  keyword?: string
}

interface DangerAct extends ActCopy {
  gesture: AccountGesture
  handle: Handle
}

function act(
  gesture: AccountGesture,
  handle: Handle,
  copy: ActCopy
): DangerAct {
  return { gesture, handle, ...copy }
}

export function AdminUserDanger({
  detail,
  acts,
  refusedTitle,
}: AdminUserDangerProps) {
  const t = useTranslations()
  const navigate = useNavigate()
  const touched = [queryKeys.admin.user(detail.id), queryKeys.admin.allUsers]
  const erasing = detail.state === "deleting"
  const email = detail.email

  const suspend = useConfirmMutation<ConfirmFormValues>({
    mutationFn: (values) =>
      banUser(detail.id, { reason: values.reason, until: values.until }),
    invalidate: touched,
    done: () => t("admin.users.suspendDone", { email }),
    failed: {
      title: t("admin.users.suspendFailed"),
      fix: t("admin.users.suspendFailedFix"),
    },
  })
  const lift = useConfirmMutation<ConfirmFormValues>({
    mutationFn: () => unbanUser(detail.id),
    invalidate: touched,
    done: () => t("admin.users.unsuspendDone", { email }),
    failed: { title: t("admin.users.unsuspendFailed") },
  })
  const deactivate = useConfirmMutation<ConfirmFormValues>({
    mutationFn: (values) => deactivateUser(detail.id, values.reason),
    invalidate: touched,
    done: () => t("admin.users.deactivateDone", { email }),
    failed: { title: t("admin.users.deactivateFailed") },
  })
  const reactivate = useConfirmMutation<ConfirmFormValues>({
    mutationFn: () => reactivateUser(detail.id),
    invalidate: touched,
    done: () =>
      erasing
        ? t("admin.users.cancelDeletionDone", { email })
        : t("admin.users.reactivateDone", { email }),
    failed: { title: t("admin.users.reactivateFailed") },
  })
  const remove = useConfirmMutation<ConfirmFormValues>({
    mutationFn: (values) => deleteUser(detail.id, values.reason),
    invalidate: touched,
    done: () =>
      erasing
        ? t("admin.users.purgeDone", { email })
        : t("admin.users.deleteDone", { email, days: DELETION_GRACE_DAYS }),
    failed: {
      title: t("admin.users.deleteFailed"),
      fix: t("admin.users.deleteFailedFix"),
    },
    onDone: () => {
      if (erasing) {
        navigate({ to: "/dashboard/admin/users" })
      }
    },
  })
  const sessions = useConfirmMutation<ConfirmFormValues>({
    mutationFn: () => revokeUserSessions(detail.id),
    invalidate: touched,
    done: () => t("admin.users.revokeSessionsDone", { email }),
    failed: { title: t("admin.users.revokeSessionsFailed") },
  })

  if (detail.platform_role !== null) {
    return <Callout title={t("admin.users.platformMember")} tone="warn" />
  }

  const purgeDate = detail.deletion_at
    ? formatDateTime(detail.deletion_at, t)
    : t("format.none")

  const available: Record<AccountGesture, DangerAct> = {
    suspend: act("suspend", suspend, {
      label: t("admin.users.suspend"),
      title: t("admin.users.suspendTitle"),
      description: t("admin.users.suspendDescription", { email }),
      icon: Ban,
      tone: "danger",
      busyLabel: t("admin.users.suspending"),
      reason: "required",
      until: true,
    }),
    unsuspend: act("unsuspend", lift, {
      label: t("admin.users.unsuspend"),
      title: t("admin.users.unsuspend"),
      description: t("admin.users.unsuspendDescription", { email }),
      icon: ShieldCheck,
      tone: "warning",
      busyLabel: t("admin.users.unsuspending"),
    }),
    deactivate: act("deactivate", deactivate, {
      label: t("admin.users.deactivate"),
      title: t("admin.users.deactivateTitle"),
      description: t("admin.users.deactivateDescription", { email }),
      icon: UserMinus,
      tone: "danger",
      busyLabel: t("admin.users.deactivating"),
      reason: "required",
    }),
    reactivate: act("reactivate", reactivate, {
      label: t("admin.users.reactivate"),
      title: t("admin.users.reactivate"),
      description: t("admin.users.reactivateDescription", { email }),
      icon: RotateCcw,
      tone: "warning",
      busyLabel: t("admin.users.reactivating"),
    }),
    cancel_deletion: act("cancel_deletion", reactivate, {
      label: t("admin.users.cancelDeletion"),
      title: t("admin.users.cancelDeletion"),
      description: t("admin.users.cancelDeletionDescription", {
        email,
        date: purgeDate,
      }),
      icon: RotateCcw,
      tone: "warning",
      busyLabel: t("admin.users.reactivating"),
    }),
    delete: act("delete", remove, {
      label: t("admin.users.delete"),
      title: t("admin.users.deleteTitle"),
      description: t("admin.users.deleteDescription", {
        email,
        days: DELETION_GRACE_DAYS,
      }),
      icon: Trash2,
      tone: "danger",
      busyLabel: t("admin.users.deletingNow"),
      reason: "required",
      keyword: email,
    }),
    purge: act("purge", remove, {
      label: t("admin.users.purge"),
      title: t("admin.users.purgeTitle"),
      description: t("admin.users.purgeDescription", { email }),
      icon: Trash2,
      tone: "danger",
      busyLabel: t("admin.users.deletingNow"),
      reason: "required",
      keyword: email,
    }),
    revoke_sessions: act("revoke_sessions", sessions, {
      label: t("admin.users.revokeSessions"),
      title: t("admin.users.revokeSessionsTitle"),
      description: t("admin.users.revokeSessionsDescription", { email }),
      icon: LogOut,
      tone: "warning",
      busyLabel: t("admin.users.revokingSessions"),
    }),
  }

  return (
    <div className="flex flex-col gap-gutter">
      {accountGestures(detail.state).map((gesture) => {
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
                    ? t("admin.users.reason")
                    : undefined
                }
                reasonRequiredMessage={t("admin.users.reasonRequired")}
                refusal={one.handle.refusal}
                title={one.title}
                tone={one.tone}
                triggerDisabled={!acts}
                triggerIcon={one.icon}
                triggerLabel={one.label}
                triggerTitle={refusedTitle}
                until={one.until}
                untilLabel={t("admin.users.suspendUntil")}
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
