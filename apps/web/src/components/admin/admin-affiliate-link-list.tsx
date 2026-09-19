import { useQuery } from "@tanstack/react-query"
import { Link2 } from "lucide-react"
import {
  type AdminAffiliateLinkRowLink,
  adminAffiliateLinkColumns,
} from "@/components/admin/admin-affiliate-link-columns"
import { AdminAffiliateLinkForm } from "@/components/admin/admin-affiliate-link-form"
import { AsyncDataTable } from "@/components/ui/async-data-table"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import {
  patchQuery,
  useOptimisticMutation,
} from "@/hooks/use-optimistic-mutation"
import {
  type AffiliateLink,
  affiliateLinksQueryOptions,
  setAffiliateLinkDisabled,
} from "@/lib/api/admin-queries"
import { queryKeys } from "@/lib/api/queries"
import { canActOnPlatform } from "@/lib/domain/admin"
import type { ListSearchHandle } from "@/lib/domain/list-search"

interface ToggleTarget {
  id: string
  name: string
  disabled: boolean
}

export interface AdminAffiliateLinkListSearch {
  offset?: number
}

export type AdminAffiliateLinkListProps =
  ListSearchHandle<AdminAffiliateLinkListSearch>

const PAGE_SIZE = 25

export function AdminAffiliateLinkList({
  search,
  setSearch,
}: AdminAffiliateLinkListProps) {
  const t = useTranslations()
  const { platformRole } = useDashboardContext()
  const links = useQuery(affiliateLinksQueryOptions())
  const acts = canActOnPlatform(platformRole)
  const offset = search.offset ?? 0

  const toggle = useOptimisticMutation<ToggleTarget, AffiliateLink>({
    mutationFn: ({ id, disabled }) => setAffiliateLinkDisabled(id, disabled),
    patch: [
      patchQuery<AffiliateLink[], ToggleTarget>(
        queryKeys.admin.affiliateLinks,
        (previous, target) =>
          previous.map((link) =>
            link.id === target.id
              ? { ...link, disabled: target.disabled }
              : link
          )
      ),
    ],
    invalidate: [queryKeys.admin.affiliateLinks],
    toast: {
      done: (_data, target) =>
        t(
          target.disabled
            ? "admin.links.disabledDone"
            : "admin.links.enabledDone",
          { name: target.name }
        ),
      failed: () => ({
        title: t("admin.links.toggleFailed"),
        fix: t("admin.links.toggleFailedFix"),
      }),
    },
  })
  const all = links.data ?? []

  return (
    <div className="flex flex-col gap-gutter">
      <AsyncDataTable
        columns={adminAffiliateLinkColumns(t, {
          canAct: acts,
          toggling: toggle.isPending ? toggle.variables?.id : undefined,
          onToggle: (link: AdminAffiliateLinkRowLink, disabled: boolean) => {
            toggle.mutate({ id: link.id, name: link.name, disabled })
          },
        })}
        data={all.slice(offset, offset + PAGE_SIZE)}
        emptyIcon={Link2}
        emptyTitle={t("admin.links.empty")}
        isError={links.isError}
        isFetching={links.isFetching}
        isPending={links.isPending}
        limit={PAGE_SIZE}
        offset={offset}
        onOffsetChange={(next) => {
          setSearch({ offset: next })
        }}
        refetch={() => {
          links.refetch()
        }}
        rowKey={(link) => link.id}
        rowLink={(link) => ({
          to: "/dashboard/admin/affiliate-links/$id",
          params: { id: link.id },
        })}
        title={t("admin.links.title")}
        total={all.length}
      />

      {acts ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.links.create")}</CardTitle>
          </CardHeader>
          <CardBody>
            <AdminAffiliateLinkForm />
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}
