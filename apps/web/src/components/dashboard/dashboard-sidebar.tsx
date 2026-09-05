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
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { usePermission } from "@/hooks/use-permission"
import { authClient } from "@/lib/auth/client"
import { ENTITLEMENT_KEYS } from "@/lib/domain/server-status"
import type { DictionaryKey } from "@/lib/i18n/en"

interface SidebarEntry {
  to: string
  label: DictionaryKey
  icon: typeof Server
}

const ORGANIZATION_LINKS: SidebarEntry[] = [
  { to: "/dashboard/servers", label: "nav.servers", icon: Server },
  { to: "/dashboard/members", label: "nav.members", icon: Users },
]

const AUDIT_LINK: SidebarEntry = {
  to: "/dashboard/audit",
  label: "nav.audit",
  icon: ScrollText,
}

const BILLING_LINK: SidebarEntry = {
  to: "/dashboard/billing",
  label: "nav.billing",
  icon: CreditCard,
}

const ACCOUNT_LINKS: SidebarEntry[] = [
  { to: "/dashboard/devices", label: "nav.devices", icon: Laptop },
  { to: "/download", label: "nav.download", icon: Download },
  { to: "/dashboard/settings", label: "nav.settings", icon: SlidersHorizontal },
]

export function DashboardSidebar() {
  const t = useTranslations()
  const { user, entitlement } = useDashboardContext()
  const canManageBilling = usePermission("billing:manage")
  const canReadAudit = usePermission("audit:view")
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const groups = [
    {
      label: t("nav.group.organization"),
      links: [
        ...ORGANIZATION_LINKS,
        ...(canReadAudit ? [AUDIT_LINK] : []),
        ...(canManageBilling ? [BILLING_LINK] : []),
      ],
    },
    { label: t("nav.group.account"), links: ACCOUNT_LINKS },
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
                  label={t(link.label)}
                  to={link.to}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1">
        <p className="px-2 pb-1 text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
          {ENTITLEMENT_KEYS[entitlement]
            ? t(ENTITLEMENT_KEYS[entitlement])
            : entitlement}
        </p>
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
          {t("nav.signOut")}
        </button>
      </div>
    </aside>
  )
}
