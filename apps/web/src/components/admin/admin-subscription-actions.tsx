import { useNavigate } from "@tanstack/react-router"
import { CircleStop, PlayCircle, Trash2 } from "lucide-react"
import { AdminSubscriptionResizeForm } from "@/components/admin/admin-subscription-resize-form"
import { AdminSubscriptionTrialForm } from "@/components/admin/admin-subscription-trial-form"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ConfirmFormDialog } from "@/components/ui/confirm-form-dialog"
import { DangerZone } from "@/components/ui/danger-zone"
import { useTranslations } from "@/hooks/use-locale"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import { useToast } from "@/hooks/use-toast"
import {
  type AdminSubscription,
  type AdminSubscriptionDetail,
  cancelSubscription,
  deleteSubscription,
  resumeSubscription,
} from "@/lib/api/admin-queries"
import { apiFailure } from "@/lib/api/errors"
import { queryKeys } from "@/lib/api/queries"
import {
  canCancelSubscription,
  canDeleteSubscription,
  canExtendTrial,
  canResizeSubscription,
  canResumeSubscription,
} from "@/lib/domain/admin"
import type { Translate } from "@/lib/i18n/i18n"
import { formatDateTime } from "@/lib/utils/format"

export interface AdminSubscriptionActionsProps {
  subscription: AdminSubscriptionDetail
}

/** A Stripe period already paid runs to its end; a platform product stops at once. */
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
  const toasts = useToast()
  const navigate = useNavigate()
  const organization = subscription.organization
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
  // A refusal belongs in the dialog the reader is still typing in, not in a toast behind it.
  const cancel = useOptimisticMutation<string, AdminSubscription>({
    mutationFn: (reason) => cancelSubscription(subscription.id, reason),
    invalidate: around,
    onDone: () => {
      toasts.done(
        t("admin.subscriptions.canceled", { organization: organization.name })
      )
    },
  })
  const remove = useOptimisticMutation({
    mutationFn: () => deleteSubscription(subscription.id),
    invalidate: around,
    onDone: () => {
      toasts.done(
        t("admin.subscriptions.deleted", { organization: organization.name })
      )
      navigate({ to: "/dashboard/admin/subscriptions" })
    },
  })

  return (
    <div className="flex flex-col gap-gutter">
      {canResizeSubscription(subscription.product) ? (
        <AdminSubscriptionResizeForm
          endsAt={subscription.current_period_end}
          organization={organization}
          quantity={subscription.quantity}
          subscriptionId={subscription.id}
        />
      ) : null}

      {canExtendTrial(subscription) ? (
        <AdminSubscriptionTrialForm
          organization={organization}
          subscriptionId={subscription.id}
          trialEndsAt={subscription.current_period_end}
        />
      ) : null}

      {canResumeSubscription(subscription) ? (
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

      {canCancelSubscription(subscription.status) ? (
        <DangerZone
          action={
            <ConfirmFormDialog
              busy={cancel.isPending}
              busyLabel={t("admin.subscriptions.canceling")}
              confirmLabel={t("admin.subscriptions.cancel")}
              description={cancelConsequence(subscription, t)}
              id="cancel"
              onConfirm={(values) => {
                cancel.mutate(values.reason)
              }}
              reason="required"
              reasonLabel={t("admin.servers.reason")}
              reasonRequiredMessage={t(
                "admin.subscriptions.cancelReasonRequired"
              )}
              refusal={apiFailure(cancel.error)}
              title={t("admin.subscriptions.cancelTitle")}
              triggerIcon={CircleStop}
              triggerLabel={t("admin.subscriptions.cancel")}
            />
          }
          description={cancelConsequence(subscription, t)}
          title={t("admin.subscriptions.cancelZoneTitle")}
        />
      ) : null}

      {canDeleteSubscription(subscription) ? (
        <DangerZone
          action={
            <ConfirmFormDialog
              busy={remove.isPending}
              busyLabel={t("admin.subscriptions.deleting")}
              confirmLabel={t("admin.subscriptions.delete")}
              description={t("admin.subscriptions.deleteDescription", {
                organization: organization.name,
              })}
              id="delete"
              keyword={subscription.stripe_subscription_id}
              onConfirm={() => {
                remove.mutate(undefined)
              }}
              refusal={apiFailure(remove.error)}
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
