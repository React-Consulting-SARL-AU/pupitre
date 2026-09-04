import { useQueryClient } from "@tanstack/react-query"
import { Check, ChevronsUpDown } from "lucide-react"
import { useState } from "react"
import {
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { authClient } from "@/lib/auth/client"

export function OrganizationSwitcher() {
  const { organizations, activeOrganization } = useDashboardContext()
  const queryClient = useQueryClient()
  const [switching, setSwitching] = useState(false)

  async function select(organizationId: string) {
    if (organizationId === activeOrganization?.id) {
      return
    }

    setSwitching(true)
    await authClient().organization.setActive({ organizationId })
    await queryClient.invalidateQueries()
    setSwitching(false)
  }

  return (
    <MenuRoot>
      <MenuTrigger
        className="flex w-full items-center justify-between gap-2 rounded-sm bg-sunken px-2 py-2 text-[13px] text-ink transition-colors duration-[120ms] ease-[ease] hover:bg-raised focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2 disabled:text-ink-4"
        disabled={switching}
      >
        <span className="truncate">
          {activeOrganization?.name ?? "Aucune organisation"}
        </span>
        <ChevronsUpDown
          className="size-4 shrink-0 text-ink-3"
          strokeWidth={1.5}
        />
      </MenuTrigger>
      <MenuPopup>
        <MenuGroup>
          <MenuGroupLabel>Organisations</MenuGroupLabel>
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
                {organization.role}
              </span>
            </MenuItem>
          ))}
        </MenuGroup>
      </MenuPopup>
    </MenuRoot>
  )
}
