import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import {
  CreditCard,
  Download,
  Laptop,
  LogOut,
  ScrollText,
  Server,
  SlidersHorizontal,
  Users,
} from "lucide-react"
import { OrganizationSwitcher } from "@/components/dashboard/organization-switcher"
import { SidebarLink } from "@/components/dashboard/sidebar-link"
import { ThemeToggle } from "@/components/dashboard/theme-toggle"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { usePermission } from "@/hooks/use-permission"
import { authClient } from "@/lib/auth/client"
import { ENTITLEMENT_LABELS } from "@/lib/domain/server-status"

const ORGANIZATION_LINKS = [
  { to: "/dashboard/servers", label: "Serveurs", icon: Server },
  { to: "/dashboard/members", label: "Membres", icon: Users },
]

const AUDIT_LINK = {
  to: "/dashboard/audit",
  label: "Journal",
  icon: ScrollText,
}

const BILLING_LINK = {
  to: "/dashboard/billing",
  label: "Facturation",
  icon: CreditCard,
}

const ACCOUNT_LINKS = [
  { to: "/dashboard/devices", label: "Appareils", icon: Laptop },
  { to: "/download", label: "Télécharger l'app", icon: Download },
  { to: "/dashboard/settings", label: "Préférences", icon: SlidersHorizontal },
]

export function DashboardSidebar() {
  const { user, entitlement } = useDashboardContext()
  const canManageBilling = usePermission("billing:manage")
  const canReadAudit = usePermission("audit:view")
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const groups = [
    {
      label: "Organisation",
      links: [
        ...ORGANIZATION_LINKS,
        ...(canReadAudit ? [AUDIT_LINK] : []),
        ...(canManageBilling ? [BILLING_LINK] : []),
      ],
    },
    { label: "Mon compte", links: ACCOUNT_LINKS },
  ]

  async function signOut() {
    await authClient().signOut()
    queryClient.clear()
    await navigate({ to: "/auth/sign-in" })
  }

  return (
    <aside className="flex w-[248px] shrink-0 flex-col gap-6 border-line border-r bg-surface p-3">
      <div className="flex items-center gap-2 px-2 pt-1">
        <span className="flex size-6 items-center justify-center rounded-md bg-inverse font-data text-[11px] text-inverse-ink">
          &gt;_
        </span>
        <span className="font-bold font-display text-[15px] text-ink tracking-[-0.01em]">
          Pupitre
        </span>
      </div>

      <OrganizationSwitcher />

      <nav className="flex flex-col gap-6">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="px-2 pb-2 text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
              {group.label}
            </p>
            <div className="flex flex-col gap-[2px]">
              {group.links.map((link) => (
                <SidebarLink
                  icon={link.icon}
                  key={link.to}
                  label={link.label}
                  to={link.to}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1">
        <p className="px-2 pb-1 text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
          {ENTITLEMENT_LABELS[entitlement] ?? entitlement}
        </p>
        <ThemeToggle />
        <div className="my-1 h-px bg-line" />
        <p className="truncate px-2 text-[12px] text-ink-3">{user.email}</p>
        <button
          className="flex items-center gap-2 rounded-sm px-2 py-2 text-[13px] text-ink-2 transition-colors duration-[120ms] ease-[ease] hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
          onClick={() => {
            signOut()
          }}
          type="button"
        >
          <LogOut className="size-4" strokeWidth={1.5} />
          Se déconnecter
        </button>
      </div>
    </aside>
  )
}
