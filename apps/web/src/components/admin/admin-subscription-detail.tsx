import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { CircleStop, Trash2 } from "lucide-react"
import { AdminEventsCard } from "@/components/admin/admin-events-card"
import { AdminFacts } from "@/components/admin/admin-facts"
import { AdminFailure } from "@/components/admin/admin-failure"
import { AdminSubscriptionResizeForm } from "@/components/admin/admin-subscription-resize-form"
import { AdminSubscriptionStatus } from "@/components/admin/admin-subscription-status"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ConfirmFormDialog } from "@/components/ui/confirm-form-dialog"
import { SkeletonCards } from "@/components/ui/skeleton"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import {
  type AdminSubscription,
  adminSubscriptionQueryOptions,
  cancelSubscription,
  deleteSubscription,
} from "@/lib/api/admin-queries"
import { queryKeys } from "@/lib/api/queries"
import {
  canActOnPlatform,
  canCancelSubscription,
  canDeleteSubscription,
  canResizeSubscription,
} from "@/lib/domain/admin"
import { formatDateTime, formatProduct } from "@/lib/utils/format"

export interface AdminSubscriptionDetailProps {
  id: string
}

export function AdminSubscriptionDetail({ id }: AdminSubscriptionDetailProps) {
  const t = useTranslations()
  const navigate = useNavigate()
  const { platformRole } = useDashboardContext()
  const subscription = useQuery(adminSubscriptionQueryOptions(id))
  const organizationId = subscription.data?.organization.id ?? null
  const organizationName = subscription.data?.organization.name ?? ""
  const around = organizationId
    ? [
        queryKeys.admin.allSubscriptions,
        queryKeys.admin.organization(organizationId),
        queryKeys.admin.allServers,
      ]
    : [queryKeys.admin.allSubscriptions]

  const cancel = useOptimisticMutation<string, AdminSubscription>({
    mutationFn: (reason) => cancelSubscription(id, reason),
    invalidate: [queryKeys.admin.subscription(id), ...around],
    toast: {
      done: () =>
        t("admin.subscriptions.canceled", { organization: organizationName }),
      failed: () => ({
        title: t("admin.subscriptions.cancelFailed"),
        fix: t("admin.subscriptions.cancelFailedFix"),
      }),
    },
  })
  const remove = useOptimisticMutation({
    mutationFn: () => deleteSubscription(id),
    invalidate: around,
    onStart: () => {
      navigate({ to: "/dashboard/admin/subscriptions" })
    },
    toast: {
      done: () =>
        t("admin.subscriptions.deleted", { organization: organizationName }),
      failed: () => ({
        title: t("admin.subscriptions.deleteFailed"),
        fix: t("admin.subscriptions.deleteFailedFix"),
        action: {
          label: t("serverActions.reopen"),
          run: () => {
            navigate({
              to: "/dashboard/admin/subscriptions/$id",
              params: { id },
            })
          },
        },
      }),
    },
  })

  if (subscription.isPending) {
    return <SkeletonCards label={t("admin.reading")} />
  }

  if (subscription.isError) {
    return (
      <AdminFailure
        fetching={subscription.isFetching}
        onRetry={() => {
          subscription.refetch()
        }}
      />
    )
  }

  const detail = subscription.data
  const acts = canActOnPlatform(platformRole)

  return (
    <div className="flex flex-col gap-gutter">
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.subscriptions.profile")}</CardTitle>
          <div className="flex items-center gap-3">
            <AdminSubscriptionStatus
              product={detail.product}
              status={detail.status}
            />
            {acts && canCancelSubscription(detail.status) ? (
              <ConfirmFormDialog
                busy={cancel.isPending}
                busyLabel={t("admin.subscriptions.canceling")}
                confirmLabel={t("admin.subscriptions.cancel")}
                description={t("admin.subscriptions.cancelDescription", {
                  organization: detail.organization.name,
                })}
                id="cancel"
                onConfirm={(values) => {
                  cancel.mutate(values.reason)
                }}
                reason="required"
                reasonLabel={t("admin.servers.reason")}
                reasonRequiredMessage={t(
                  "admin.subscriptions.cancelReasonRequired"
                )}
                title={t("admin.subscriptions.cancelTitle")}
                triggerIcon={CircleStop}
                triggerLabel={t("admin.subscriptions.cancel")}
              />
            ) : null}
            {acts && canDeleteSubscription(detail) ? (
              <ConfirmDialog
                busy={remove.isPending}
                busyLabel={t("admin.subscriptions.deleting")}
                confirmLabel={t("admin.subscriptions.delete")}
                description={t("admin.subscriptions.deleteDescription", {
                  organization: detail.organization.name,
                })}
                onConfirm={() => {
                  remove.mutate(undefined)
                }}
                title={t("admin.subscriptions.deleteTitle")}
                triggerIcon={Trash2}
                triggerLabel={t("admin.subscriptions.delete")}
              />
            ) : null}
          </div>
        </CardHeader>

        <AdminFacts
          facts={[
            {
              label: t("admin.servers.organization"),
              value: (
                <Link
                  className="underline-offset-2 hover:underline"
                  params={{ id: detail.organization.id }}
                  to="/dashboard/admin/organizations/$id"
                >
                  {detail.organization.name}
                </Link>
              ),
            },
            {
              label: t("admin.subscriptions.productLabel"),
              value: formatProduct(detail.product, t),
            },
            {
              label: t("admin.subscriptions.seats"),
              value: t.plural("admin.links.seats", detail.quantity),
            },
            {
              label: t("admin.subscriptions.periodEnd"),
              value: detail.current_period_end
                ? formatDateTime(detail.current_period_end, t)
                : t("admin.subscriptions.noEnd"),
            },
            {
              label: t("admin.subscriptions.note"),
              value: detail.note ?? t("format.none"),
            },
            {
              label: t("admin.users.createdAt"),
              value: formatDateTime(detail.created_at, t),
            },
            {
              label: t("admin.subscriptions.updatedAt"),
              value: formatDateTime(detail.updated_at, t),
            },
            ...(detail.platform
              ? []
              : [
                  {
                    label: t("admin.subscriptions.stripeId"),
                    value: (
                      <span className="font-data text-[12px]">
                        {detail.stripe_subscription_id}
                      </span>
                    ),
                  },
                ]),
          ]}
        />
      </Card>

      {acts && canResizeSubscription(detail.product) ? (
        <AdminSubscriptionResizeForm
          endsAt={detail.current_period_end}
          organization={detail.organization}
          quantity={detail.quantity}
          subscriptionId={detail.id}
        />
      ) : null}

      <AdminEventsCard
        events={detail.events.map((event) => ({
          ...event,
          actor: event.actor?.email ?? null,
        }))}
      />
    </div>
  )
}
