import { ADMIN_PAGE_SIZE } from "@pupitre/shared/platform"
import { useQuery } from "@tanstack/react-query"
import { CreditCard } from "lucide-react"
import { useState } from "react"
import { AdminFailure } from "@/components/admin/admin-failure"
import { AdminSubscriptionRow } from "@/components/admin/admin-subscription-row"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Label } from "@/components/ui/label"
import { Pagination } from "@/components/ui/pagination"
import { Select } from "@/components/ui/select"
import { SkeletonRows } from "@/components/ui/skeleton"
import { useTranslations } from "@/hooks/use-locale"
import { adminSubscriptionsQueryOptions } from "@/lib/api/admin-queries"
import {
  SUBSCRIPTION_PRODUCT_FILTERS,
  SUBSCRIPTION_STATUS_FILTERS,
} from "@/lib/domain/admin"
import { subscriptionStatusLook } from "@/lib/domain/billing"
import { formatProduct } from "@/lib/utils/format"

const ALL = ""

export function AdminSubscriptionList() {
  const t = useTranslations()
  const [status, setStatus] = useState(ALL)
  const [product, setProduct] = useState(ALL)
  const [offset, setOffset] = useState(0)
  const page = useQuery(
    adminSubscriptionsQueryOptions({
      limit: ADMIN_PAGE_SIZE,
      offset,
      ...(status === ALL ? {} : { status }),
      ...(product === ALL ? {} : { product }),
    })
  )

  function statusName(candidate: string): string {
    const look = subscriptionStatusLook(candidate)

    return look ? t(look.label) : candidate
  }

  return (
    <div className="flex flex-col gap-gutter">
      <div className="flex flex-wrap items-end gap-gutter">
        <div className="flex flex-col gap-2">
          <Label htmlFor="admin-subscriptions-status">
            {t("admin.servers.status")}
          </Label>
          <Select
            className="w-[200px]"
            id="admin-subscriptions-status"
            items={[
              { value: ALL, label: t("admin.servers.allStatuses") },
              ...SUBSCRIPTION_STATUS_FILTERS.map((candidate) => ({
                value: candidate,
                label: statusName(candidate),
              })),
            ]}
            onValueChange={(next) => {
              setStatus(next)
              setOffset(0)
            }}
            value={status}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="admin-subscriptions-product">
            {t("admin.subscriptions.productLabel")}
          </Label>
          <Select
            className="w-[200px]"
            id="admin-subscriptions-product"
            items={[
              { value: ALL, label: t("admin.subscriptions.allProducts") },
              ...SUBSCRIPTION_PRODUCT_FILTERS.map((candidate) => ({
                value: candidate,
                label: formatProduct(candidate, t),
              })),
            ]}
            onValueChange={(next) => {
              setProduct(next)
              setOffset(0)
            }}
            value={product}
          />
        </div>
      </div>

      {page.isPending ? <SkeletonRows label={t("admin.reading")} /> : null}

      {page.isError ? (
        <AdminFailure
          fetching={page.isFetching}
          onRetry={() => {
            page.refetch()
          }}
        />
      ) : null}

      {page.isSuccess && page.data.total === 0 ? (
        <EmptyState icon={CreditCard} title={t("admin.subscriptions.empty")} />
      ) : null}

      {page.isSuccess && page.data.total > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.subscriptions.title")}</CardTitle>
            <span className="font-data text-[12px] text-ink-3 tabular-nums">
              {t("admin.range", {
                from: offset + 1,
                to: offset + page.data.data.length,
                total: page.data.total,
              })}
            </span>
          </CardHeader>

          <ul aria-busy={page.isFetching || undefined}>
            {page.data.data.map((subscription) => (
              <AdminSubscriptionRow
                key={subscription.id}
                subscription={subscription}
              />
            ))}
          </ul>
        </Card>
      ) : null}

      {page.isSuccess ? (
        <Pagination
          nextLabel={t("admin.next")}
          offset={offset}
          onOffsetChange={setOffset}
          pageSize={ADMIN_PAGE_SIZE}
          previousLabel={t("admin.previous")}
          total={page.data.total}
        />
      ) : null}
    </div>
  )
}
