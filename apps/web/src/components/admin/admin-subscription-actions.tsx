import { useNavigate } from "@tanstack/react-router"
import { CircleStop, PlayCircle, Trash2 } from "lucide-react"
import { AdminSubscriptionResizeForm } from "@/components/admin/admin-subscription-resize-form"
import { AdminSubscriptionTrialForm } from "@/components/admin/admin-subscription-trial-form"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ConfirmFormDialog } from "@/components/ui/confirm-form-dialog"
import { DangerZone } from "@/components/ui/danger-zone"
import { useConfirmMutation } from "@/hooks/use-confirm-mutation"
import { useTranslations } from "@/hooks/use-locale"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import {
  type AdminSubscription,
  type AdminSubscriptionDetail,
  cancelSubscription,
  deleteSubscription,
  resumeSubscription,
} from "@/lib/api/admin-queries"
import { queryKeys } from "@/lib/api/queries"
import type { Translate } from "@/lib/i18n/i18n"
import type { ConfirmFormValues } from "@/lib/schemas/confirm-form"
import { formatDateTime } from "@/lib/utils/format"

export interface AdminSubscriptionActionsProps {
  subscription: AdminSubscriptionDetail
}

function cancelConsequence(
  subscription: AdminSubscriptionDetail,
  t: Translate
): string {
  const end = subscription.current_period_end

  if (subscription.platform || !end || new Date(end).getTime() <= Date.now()) {
    return t("admin.subscriptions.cancelNow", {
      organization: subscription.organization.name,
    })
  }

  return t("admin.subscriptions.cancelUntil", {
    organization: subscription.organization.name,
    date: formatDateTime(end, t),
  })
}

export function AdminSubscriptionActions({
  subscription,
}: AdminSubscriptionActionsProps) {
  const t = useTranslations()
  const navigate = useNavigate()
  const organization = subscription.organization
  const allowed = new Set(subscription.allowed_actions)
  const around = [
    queryKeys.admin.subscription(subscription.id),
    queryKeys.admin.allSubscriptions,
    queryKeys.admin.organization(organization.id),
    queryKeys.admin.allServers,
  ]
  const resume = useOptimisticMutation<void, AdminSubscription>({
    mutationFn: () => resumeSubscription(subscription.id),
    invalidate: around,
    toast: {
      done: () =>
        t("admin.subscriptions.resumed", { organization: organization.name }),
      failed: () => ({
        title: t("admin.subscriptions.resumeFailed"),
        fix: t("admin.subscriptions.resumeFailedFix"),
      }),
    },
  })
  const cancel = useConfirmMutation<ConfirmFormValues>({
    mutationFn: (values) => cancelSubscription(subscription.id, values.reason),
    invalidate: around,
    done: () =>
      t("admin.subscriptions.canceled", { organization: organization.name }),
    failed: {
      title: t("admin.subscriptions.cancelFailed"),
      fix: t("admin.subscriptions.cancelFailedFix"),
    },
  })
  const remove = useConfirmMutation<ConfirmFormValues>({
    mutationFn: () => deleteSubscription(subscription.id),
    invalidate: around,
    done: () =>
      t("admin.subscriptions.deleted", { organization: organization.name }),
    failed: {
      title: t("admin.subscriptions.deleteFailed"),
      fix: t("admin.subscriptions.deleteFailedFix"),
    },
    onDone: () => {
      navigate({ to: "/dashboard/admin/subscriptions" })
    },
  })

  return (
    <div className="flex flex-col gap-gutter">
      {allowed.has("resize") ? (
        <AdminSubscriptionResizeForm
          endsAt={subscription.current_period_end}
          organization={organization}
          quantity={subscription.quantity}
          subscriptionId={subscription.id}
        />
      ) : null}

      {allowed.has("extend_trial") ? (
        <AdminSubscriptionTrialForm
          organization={organization}
          subscriptionId={subscription.id}
          trialEndsAt={subscription.current_period_end}
        />
      ) : null}

      {allowed.has("resume") ? (
        <DangerZone
          action={
            <ConfirmDialog
              busy={resume.isPending}
              busyLabel={t("admin.subscriptions.resuming")}
              confirmLabel={t("admin.subscriptions.resume")}
              description={t("admin.subscriptions.resumeDescription", {
                organization: organization.name,
              })}
              onConfirm={() => {
                resume.mutate(undefined)
              }}
              title={t("admin.subscriptions.resumeTitle")}
              triggerIcon={PlayCircle}
              triggerLabel={t("admin.subscriptions.resume")}
              triggerVariant="secondary"
            />
          }
          description={t("admin.subscriptions.resumeDescription", {
            organization: organization.name,
          })}
          title={t("admin.subscriptions.resumeZoneTitle")}
          tone="warning"
        />
      ) : null}

      {allowed.has("cancel") ? (
        <DangerZone
          action={
            <ConfirmFormDialog
              busy={cancel.busy}
              busyLabel={t("admin.subscriptions.canceling")}
              confirmLabel={t("admin.subscriptions.cancel")}
              description={cancelConsequence(subscription, t)}
              id="cancel"
              onConfirm={cancel.run}
              onOpenChange={(open) => {
                if (!open) {
                  cancel.reset()
                }
              }}
              reason="required"
              reasonLabel={t("admin.servers.reason")}
              reasonRequiredMessage={t(
                "admin.subscriptions.cancelReasonRequired"
              )}
              refusal={cancel.refusal}
              title={t("admin.subscriptions.cancelTitle")}
              triggerIcon={CircleStop}
              triggerLabel={t("admin.subscriptions.cancel")}
            />
          }
          description={cancelConsequence(subscription, t)}
          title={t("admin.subscriptions.cancelZoneTitle")}
        />
      ) : null}

      {allowed.has("delete") ? (
        <DangerZone
          action={
            <ConfirmFormDialog
              busy={remove.busy}
              busyLabel={t("admin.subscriptions.deleting")}
              confirmLabel={t("admin.subscriptions.delete")}
              description={t("admin.subscriptions.deleteDescription", {
                organization: organization.name,
              })}
              id="delete"
              keyword={subscription.stripe_subscription_id}
              onConfirm={remove.run}
              onOpenChange={(open) => {
                if (!open) {
                  remove.reset()
                }
              }}
              refusal={remove.refusal}
              title={t("admin.subscriptions.deleteTitle")}
              triggerIcon={Trash2}
              triggerLabel={t("admin.subscriptions.delete")}
            />
          }
          description={t("admin.subscriptions.deleteDescription", {
            organization: organization.name,
          })}
          title={t("admin.subscriptions.deleteZoneTitle")}
        />
      ) : null}
    </div>
  )
}
