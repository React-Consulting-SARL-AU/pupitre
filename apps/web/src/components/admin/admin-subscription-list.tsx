import { ADMIN_PAGE_SIZE } from "@pupitre/shared/platform"
import { useQuery } from "@tanstack/react-query"
import { CreditCard } from "lucide-react"
import { adminSubscriptionColumns } from "@/components/admin/admin-subscription-columns"
import { AsyncDataTable } from "@/components/ui/async-data-table"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { useTranslations } from "@/hooks/use-locale"
import { adminSubscriptionsQueryOptions } from "@/lib/api/admin-queries"
import {
  SUBSCRIPTION_PRODUCT_FILTERS,
  SUBSCRIPTION_STATUS_FILTERS,
} from "@/lib/domain/admin"
import { subscriptionStatusLook } from "@/lib/domain/billing"
import type { ListSearchHandle } from "@/lib/domain/list-search"
import { formatProduct } from "@/lib/utils/format"

const ALL = ""

export interface AdminSubscriptionListSearch {
  offset?: number
  status?: string
  product?: string
}

export type AdminSubscriptionListProps =
  ListSearchHandle<AdminSubscriptionListSearch>

export function AdminSubscriptionList({
  search,
  setSearch,
}: AdminSubscriptionListProps) {
  const t = useTranslations()
  const offset = search.offset ?? 0
  const status = search.status ?? ALL
  const product = search.product ?? ALL
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
    <AsyncDataTable
      columns={adminSubscriptionColumns(t)}
      data={page.data?.data ?? []}
      emptyIcon={CreditCard}
      emptyTitle={t("admin.subscriptions.empty")}
      filters={
        <>
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
                setSearch({ status: next })
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
                setSearch({ product: next })
              }}
              value={product}
            />
          </div>
        </>
      }
      isError={page.isError}
      isFetching={page.isFetching}
      isPending={page.isPending}
      limit={ADMIN_PAGE_SIZE}
      offset={offset}
      onOffsetChange={(next) => {
        setSearch({ offset: next })
      }}
      refetch={() => {
        page.refetch()
      }}
      rowKey={(subscription) => subscription.id}
      rowLink={(subscription) => ({
        to: "/dashboard/admin/subscriptions/$id",
        params: { id: subscription.id },
      })}
      title={t("admin.subscriptions.title")}
      total={page.data?.total ?? 0}
    />
  )
}
