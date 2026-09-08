import { useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { Check, ChevronsUpDown, Plus, Settings2 } from "lucide-react"
import { useState } from "react"
import { CreateOrganizationDialog } from "@/components/dashboard/create-organization-dialog"
import {
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { isOrganizationScoped, queryKeys } from "@/lib/api/queries"
import { authClient } from "@/lib/auth/client"
import { canManageOrganization, initialOf } from "@/lib/domain/organization"
import { roleKey } from "@/lib/domain/roles"

export function OrganizationSwitcher() {
  const t = useTranslations()
  const { organizations, activeOrganization, role } = useDashboardContext()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [switching, setSwitching] = useState(false)
  const [creating, setCreating] = useState(false)
  const name = activeOrganization?.name ?? t("nav.noOrganization")
  const roleLabel = role ? t(roleKey(role) ?? "role.member") : null

  async function select(organizationId: string) {
    if (organizationId === activeOrganization?.id) {
      return
    }

    setSwitching(true)
    await authClient().organization.setActive({ organizationId })
    await navigate({ to: "/dashboard/servers" })

    // Dropped, not staled: a staled answer stays on screen until its refetch lands.
    queryClient.removeQueries({
      predicate: (query) => isOrganizationScoped(query.queryKey),
    })
    await queryClient.invalidateQueries({ queryKey: queryKeys.me })
    setSwitching(false)
  }

  return (
    <>
      <MenuRoot>
        <MenuTrigger
          className="flex w-full items-center gap-2.5 rounded-md border border-line bg-sunken px-2 py-2 text-left transition-fast hover:bg-raised focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2 disabled:text-ink-4"
          disabled={switching}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-inverse font-bold font-display text-[13px] text-inverse-ink">
            {initialOf(name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] text-ink">{name}</span>
            {roleLabel ? (
              <span className="block truncate text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
                {roleLabel}
              </span>
            ) : null}
          </span>
          <ChevronsUpDown
            className="size-4 shrink-0 text-ink-3"
            strokeWidth={1.5}
          />
        </MenuTrigger>

        <MenuPopup className="w-[248px]">
          <MenuGroup>
            <MenuGroupLabel>{t("nav.organizations")}</MenuGroupLabel>
            {organizations.map((organization) => (
              <MenuItem
                key={organization.id}
                onClick={() => {
                  select(organization.id)
                }}
              >
                <Check
                  className={
                    organization.id === activeOrganization?.id
                      ? "size-4 text-ink"
                      : "size-4 text-transparent"
                  }
                  strokeWidth={1.5}
                />
                <span className="truncate">{organization.name}</span>
                <span className="ml-auto text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
                  {t(roleKey(organization.role) ?? "role.member")}
                </span>
              </MenuItem>
            ))}
          </MenuGroup>

          <MenuSeparator />

          {activeOrganization && canManageOrganization(role) ? (
            <MenuItem render={<Link to="/dashboard/organization" />}>
              <Settings2 className="size-4 text-ink-3" strokeWidth={1.5} />
              {t("organization.manage")}
            </MenuItem>
          ) : null}

          <MenuItem
            onClick={() => {
              setCreating(true)
            }}
          >
            <Plus className="size-4 text-ink-3" strokeWidth={1.5} />
            {t("organization.create")}
          </MenuItem>
        </MenuPopup>
      </MenuRoot>

      {creating ? (
        <CreateOrganizationDialog onOpenChange={setCreating} open={creating} />
      ) : null}
    </>
  )
}
