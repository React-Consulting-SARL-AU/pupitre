import { ADMIN_PAGE_SIZE, ORGANIZATION_STATES } from "@pupitre/shared/platform"
import { useQuery } from "@tanstack/react-query"
import { Ban, Building2, DoorClosed } from "lucide-react"
import { useState } from "react"
import { adminOrganizationColumns } from "@/components/admin/admin-organization-columns"
import { AsyncDataTable } from "@/components/ui/async-data-table"
import { ConfirmFormDialog } from "@/components/ui/confirm-form-dialog"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { useConfirmMutation } from "@/hooks/use-confirm-mutation"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import {
  adminOrganizationsQueryOptions,
  closeOrganization,
  suspendOrganization,
} from "@/lib/api/admin-queries"
import { queryKeys } from "@/lib/api/queries"
import {
  isPlatformOrganization,
  organizationGestures,
  organizationLook,
} from "@/lib/domain/admin"
import type { ListSearchHandle } from "@/lib/domain/list-search"
import type { ConfirmFormValues } from "@/lib/schemas/confirm-form"

const ALL_STATES = ""

export interface AdminOrganizationListSearch {
  q?: string
  offset?: number
  state?: string
}

export type AdminOrganizationListProps =
  ListSearchHandle<AdminOrganizationListSearch>

type ListAct = "suspend" | "close"

interface Aimed {
  act: ListAct
  id: string
  name: string
}

export function AdminOrganizationList({
  search,
  setSearch,
}: AdminOrganizationListProps) {
  const t = useTranslations()
  const { platformCanAct: acts } = useDashboardContext()
  const [aimed, setAimed] = useState<Aimed | null>(null)
  const offset = search.offset ?? 0
  const query = search.q ?? ""
  const state = search.state ?? ALL_STATES
  const page = useQuery(
    adminOrganizationsQueryOptions({
      limit: ADMIN_PAGE_SIZE,
      offset,
      ...(query === "" ? {} : { q: query }),
      ...(state === ALL_STATES ? {} : { state }),
    })
  )
  const touched = [
    queryKeys.admin.allOrganizations,
    queryKeys.admin.allServers,
    queryKeys.admin.overview,
  ]
  const name = aimed?.name ?? ""
  const suspend = useConfirmMutation<ConfirmFormValues>({
    mutationFn: (values) => suspendOrganization(aimed?.id ?? "", values.reason),
    invalidate: touched,
    done: () => t("admin.organizations.suspendDone", { name }),
    failed: { title: t("admin.organizations.suspendFailed") },
    onDone: () => {
      setAimed(null)
    },
  })
  const shut = useConfirmMutation<ConfirmFormValues>({
    mutationFn: (values) => closeOrganization(aimed?.id ?? "", values.reason),
    invalidate: touched,
    done: () => t("admin.organizations.closeDone", { name }),
    failed: { title: t("admin.organizations.closeFailed") },
    onDone: () => {
      setAimed(null)
    },
  })

  function close() {
    setAimed(null)
    suspend.reset()
    shut.reset()
  }

  return (
    <>
      <AsyncDataTable
        columns={adminOrganizationColumns(t)}
        data={page.data?.data ?? []}
        emptyIcon={Building2}
        emptyTitle={t("admin.organizations.empty")}
        filters={
          <div className="flex flex-col gap-2">
            <Label htmlFor="admin-organizations-state">
              {t("admin.organizations.stateFilter")}
            </Label>
            <Select
              className="w-[200px]"
              id="admin-organizations-state"
              items={[
                {
                  value: ALL_STATES,
                  label: t("admin.organizations.allStates"),
                },
                ...ORGANIZATION_STATES.map((candidate) => ({
                  value: candidate,
                  label: t(organizationLook(candidate).label),
                })),
              ]}
              onValueChange={(next) => {
                setSearch({ state: next })
              }}
              value={state}
            />
          </div>
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
        rowActions={(organization) => {
          if (!acts || isPlatformOrganization(organization.id)) {
            return []
          }

          const offered = organizationGestures(organization.state)

          return [
            {
              label: t("admin.organizations.suspend"),
              icon: Ban,
              tone: "danger" as const,
              disabled: !offered.includes("suspend"),
              onSelect: () => {
                setAimed({
                  act: "suspend",
                  id: organization.id,
                  name: organization.name,
                })
              },
            },
            {
              label: t("admin.organizations.close"),
              icon: DoorClosed,
              tone: "danger" as const,
              disabled: !offered.includes("close"),
              onSelect: () => {
                setAimed({
                  act: "close",
                  id: organization.id,
                  name: organization.name,
                })
              },
            },
          ]
        }}
        rowKey={(organization) => organization.id}
        rowLabel={(organization) => organization.name}
        rowLink={(organization) => ({
          to: "/dashboard/admin/organizations/$id",
          params: { id: organization.id },
        })}
        search={{
          id: "admin-organizations-search",
          value: query,
          placeholder: t("admin.organizations.searchPlaceholder"),
          onChange: (next) => {
            setSearch({ q: next })
          },
        }}
        title={t("admin.organizations.title")}
        total={page.data?.total ?? 0}
      />

      <ConfirmFormDialog
        busy={suspend.busy}
        busyLabel={t("admin.organizations.suspending")}
        confirmLabel={t("admin.organizations.suspend")}
        description={t("admin.organizations.suspendDescription", { name })}
        id="suspend-organization-row"
        onConfirm={suspend.run}
        onOpenChange={(open) => {
          if (!open) {
            close()
          }
        }}
        open={aimed?.act === "suspend"}
        reason="required"
        reasonLabel={t("admin.organizations.reason")}
        reasonRequiredMessage={t("admin.organizations.reasonRequired")}
        refusal={suspend.refusal}
        title={t("admin.organizations.suspendTitle")}
        triggerLabel={t("admin.organizations.suspend")}
      />

      <ConfirmFormDialog
        busy={shut.busy}
        busyLabel={t("admin.organizations.closing")}
        confirmLabel={t("admin.organizations.close")}
        description={t("admin.organizations.closeDescription", { name })}
        id="close-organization-row"
        onConfirm={shut.run}
        onOpenChange={(open) => {
          if (!open) {
            close()
          }
        }}
        open={aimed?.act === "close"}
        reason="required"
        reasonLabel={t("admin.organizations.reason")}
        reasonRequiredMessage={t("admin.organizations.reasonRequired")}
        refusal={shut.refusal}
        title={t("admin.organizations.closeTitle")}
        triggerLabel={t("admin.organizations.close")}
      />
    </>
  )
}
