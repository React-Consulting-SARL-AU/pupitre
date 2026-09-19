import { ADMIN_PAGE_SIZE } from "@pupitre/shared/platform"
import { useQuery } from "@tanstack/react-query"
import { CreditCard, X } from "lucide-react"
import { adminSubscriptionColumns } from "@/components/admin/admin-subscription-columns"
import { AsyncDataTable } from "@/components/ui/async-data-table"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { useTranslations } from "@/hooks/use-locale"
import { adminSubscriptionsQueryOptions } from "@/lib/api/admin-queries"
import type { AdminSortDirection } from "@/lib/api/queries"
import {
  SUBSCRIPTION_PRODUCT_FILTERS,
  SUBSCRIPTION_STATUS_FILTERS,
} from "@/lib/domain/admin"
import { subscriptionStatusLook } from "@/lib/domain/billing"
import type { ListSearchHandle, SortDirection } from "@/lib/domain/list-search"
import { formatProduct } from "@/lib/utils/format"

const ALL = ""

export const SUBSCRIPTION_SORTS = [
  "created_at",
  "current_period_end",
  "updated_at",
] as const

type SubscriptionSort = (typeof SUBSCRIPTION_SORTS)[number]

export const SUBSCRIPTION_SORT: SubscriptionSort = "created_at"

export interface AdminSubscriptionListSearch {
  q?: string
  offset?: number
  status?: string
  product?: string
  organization_id?: string
  live?: boolean
  sort?: string
  direction?: SortDirection
}

export type AdminSubscriptionListProps =
  ListSearchHandle<AdminSubscriptionListSearch>

function toSort(value: string | undefined): SubscriptionSort {
  return SUBSCRIPTION_SORTS.find((sort) => sort === value) ?? SUBSCRIPTION_SORT
}

function flagValue(flag: boolean | undefined): string {
  if (flag === undefined) {
    return ALL
  }

  return flag ? "true" : "false"
}

function readFlag(value: string): boolean | undefined {
  if (value === ALL) {
    return undefined
  }

  return value === "true"
}

export function AdminSubscriptionList({
  search,
  setSearch,
}: AdminSubscriptionListProps) {
  const t = useTranslations()
  const offset = search.offset ?? 0
  const query = search.q ?? ""
  const status = search.status ?? ALL
  const product = search.product ?? ALL
  const organizationId = search.organization_id ?? ""
  const sort = toSort(search.sort)
  const direction: AdminSortDirection = search.direction ?? "desc"
  const page = useQuery(
    adminSubscriptionsQueryOptions({
      limit: ADMIN_PAGE_SIZE,
      offset,
      sort,
      direction,
      ...(status === ALL ? {} : { status }),
      ...(product === ALL ? {} : { product }),
      ...(organizationId === "" ? {} : { organization_id: organizationId }),
      ...(search.live === undefined ? {} : { live: search.live }),
      ...(query === "" ? {} : { q: query }),
    })
  )
  const organizationName =
    page.data?.data.find(
      (subscription) => subscription.organization.id === organizationId
    )?.organization.name ?? organizationId

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

          <div className="flex flex-col gap-2">
            <Label htmlFor="admin-subscriptions-live">
              {t("admin.subscriptions.live")}
            </Label>
            <Select
              className="w-[240px]"
              id="admin-subscriptions-live"
              items={[
                { value: ALL, label: t("admin.subscriptions.anyCounted") },
                { value: "true", label: t("admin.subscriptions.counted") },
                { value: "false", label: t("admin.subscriptions.over") },
              ]}
              onValueChange={(next) => {
                setSearch({ live: readFlag(next) })
              }}
              value={flagValue(search.live)}
            />
          </div>

          {organizationId === "" ? null : (
            <Button
              icon={X}
              onClick={() => {
                setSearch({ organization_id: undefined })
              }}
              size="sm"
              title={t("admin.subscriptions.everyOrganization")}
              variant="secondary"
            >
              {t("admin.subscriptions.organizationFilter", {
                name: organizationName,
              })}
            </Button>
          )}
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
      rowLabel={(subscription) => subscription.organization.name}
      rowLink={(subscription) => ({
        to: "/dashboard/admin/subscriptions/$id",
        params: { id: subscription.id },
      })}
      search={{
        id: "admin-subscriptions-search",
        value: query,
        placeholder: t("admin.subscriptions.searchPlaceholder"),
        onChange: (next) => {
          setSearch({ q: next })
        },
      }}
      sort={{
        key: sort,
        direction,
        onChange: (key, next) => {
          setSearch({ sort: toSort(key), direction: next })
        },
      }}
      title={t("admin.subscriptions.title")}
      total={page.data?.total ?? 0}
    />
  )
}
