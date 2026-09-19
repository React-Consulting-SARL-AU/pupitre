import { ADMIN_PAGE_SIZE } from "@pupitre/shared/platform"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Ban, Link2, Pencil, RotateCcw, Trash2 } from "lucide-react"
import { useState } from "react"
import {
  type AdminAffiliateLinkRowLink,
  adminAffiliateLinkColumns,
} from "@/components/admin/admin-affiliate-link-columns"
import {
  AdminAffiliateLinkDeleteDialog,
  type AdminAffiliateLinkDeleteTarget,
} from "@/components/admin/admin-affiliate-link-delete-dialog"
import { AdminAffiliateLinkForm } from "@/components/admin/admin-affiliate-link-form"
import { AsyncDataTable } from "@/components/ui/async-data-table"
import { Label } from "@/components/ui/label"
import type { RowAction } from "@/components/ui/row-actions-menu"
import { Select } from "@/components/ui/select"
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
import { filterAffiliateLinks } from "@/lib/domain/affiliate"
import type { ListSearchHandle } from "@/lib/domain/list-search"

interface ToggleTarget {
  id: string
  name: string
  disabled: boolean
}

export interface AdminAffiliateLinkListSearch {
  q?: string
  offset?: number
  disabled?: boolean
}

export type AdminAffiliateLinkListProps =
  ListSearchHandle<AdminAffiliateLinkListSearch>

const EVERY_STATE = ""

const DISABLED_VALUES: Record<string, boolean | undefined> = {
  [EVERY_STATE]: undefined,
  disabled: true,
  enabled: false,
}

function stateValue(disabled: boolean | undefined): string {
  if (disabled === undefined) {
    return EVERY_STATE
  }

  return disabled ? "disabled" : "enabled"
}

export function AdminAffiliateLinkList({
  search,
  setSearch,
}: AdminAffiliateLinkListProps) {
  const t = useTranslations()
  const navigate = useNavigate()
  const { platformRole } = useDashboardContext()
  const links = useQuery(affiliateLinksQueryOptions())
  const [removing, setRemoving] =
    useState<AdminAffiliateLinkDeleteTarget | null>(null)
  const acts = canActOnPlatform(platformRole)
  const offset = search.offset ?? 0
  const query = search.q ?? ""

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
  const kept = filterAffiliateLinks(all, { query, disabled: search.disabled })

  function rowActions(link: AdminAffiliateLinkRowLink): RowAction[] {
    return [
      {
        label: t("admin.links.edit"),
        icon: Pencil,
        onSelect: () => {
          navigate({
            to: "/dashboard/admin/affiliate-links/$id",
            params: { id: link.id },
            search: { tab: "settings" },
          })
        },
      },
      {
        label: link.disabled
          ? t("admin.links.enable")
          : t("admin.links.disable"),
        icon: link.disabled ? RotateCcw : Ban,
        onSelect: () => {
          toggle.mutate({
            id: link.id,
            name: link.name,
            disabled: !link.disabled,
          })
        },
      },
      {
        label: t("admin.links.delete"),
        icon: Trash2,
        tone: "danger",
        onSelect: () => {
          setRemoving({ id: link.id, name: link.name, code: link.code })
        },
      },
    ]
  }

  return (
    <>
      <AsyncDataTable
        columns={adminAffiliateLinkColumns(t)}
        data={kept.slice(offset, offset + ADMIN_PAGE_SIZE)}
        emptyIcon={Link2}
        emptyTitle={
          all.length === 0 ? t("admin.links.empty") : t("admin.links.noMatch")
        }
        filters={
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="admin-links-state">
                {t("admin.links.state")}
              </Label>
              <Select
                className="w-[180px]"
                id="admin-links-state"
                items={[
                  { value: EVERY_STATE, label: t("admin.links.allStates") },
                  { value: "enabled", label: t("admin.links.enabled") },
                  { value: "disabled", label: t("admin.links.disabled") },
                ]}
                onValueChange={(next) => {
                  setSearch({ disabled: DISABLED_VALUES[next] })
                }}
                value={stateValue(search.disabled)}
              />
            </div>

            {acts ? <AdminAffiliateLinkForm /> : null}
          </>
        }
        isError={links.isError}
        isFetching={links.isFetching}
        isPending={links.isPending}
        limit={ADMIN_PAGE_SIZE}
        offset={offset}
        onOffsetChange={(next) => {
          setSearch({ offset: next })
        }}
        refetch={() => {
          links.refetch()
        }}
        rowActions={acts ? rowActions : undefined}
        rowKey={(link) => link.id}
        rowLabel={(link) => link.name}
        rowLink={(link) => ({
          to: "/dashboard/admin/affiliate-links/$id",
          params: { id: link.id },
        })}
        search={{
          id: "admin-links-search",
          value: query,
          label: t("admin.links.searchLabel"),
          placeholder: t("admin.links.searchPlaceholder"),
          onChange: (next) => {
            setSearch({ q: next })
          },
        }}
        title={t("admin.links.title")}
        total={kept.length}
      />

      {removing ? (
        <AdminAffiliateLinkDeleteDialog
          key={removing.id}
          link={removing}
          onOpenChange={(next) => {
            if (!next) {
              setRemoving(null)
            }
          }}
          open
        />
      ) : null}
    </>
  )
}
