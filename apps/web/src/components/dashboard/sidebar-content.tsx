import { useQuery } from "@tanstack/react-query"
import {
  Building2,
  CreditCard,
  Gauge,
  HardDrive,
  Inbox,
  Laptop,
  Link2,
  Package,
  ScrollText,
  Server,
  SlidersHorizontal,
  Users,
  UsersRound,
} from "lucide-react"
import { ConsoleBrand } from "@/components/dashboard/console-brand"
import { OrganizationSwitcher } from "@/components/dashboard/organization-switcher"
import { SidebarAccountMenu } from "@/components/dashboard/sidebar-account-menu"
import { SidebarAppCard } from "@/components/dashboard/sidebar-app-card"
import { SidebarEntitlement } from "@/components/dashboard/sidebar-entitlement"
import { SidebarLink } from "@/components/dashboard/sidebar-link"
import { SidebarSearchButton } from "@/components/dashboard/sidebar-search-button"
import { SidebarStartLink } from "@/components/dashboard/sidebar-start-link"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { usePermission } from "@/hooks/use-permission"
import { inboxCountsQueryOptions } from "@/lib/api/inbox-queries"
import { isPlatformOrganization, platformOpen } from "@/lib/domain/admin"
import { ADMIN_ROUTE, opensWhileSuspended } from "@/lib/domain/entitlement-gate"
import { canManageOrganization } from "@/lib/domain/organization"
import type { DictionaryKey } from "@/lib/i18n/en"

interface SidebarEntry {
  to: string
  label: DictionaryKey
  icon: typeof Server
  exact?: boolean
}

const INBOX_ROUTE = `${ADMIN_ROUTE}/inbox`

const SERVERS_LINK: SidebarEntry = {
  to: "/dashboard/servers",
  label: "nav.servers",
  icon: Server,
}

const MEMBERS_LINK: SidebarEntry = {
  to: "/dashboard/members",
  label: "nav.members",
  icon: Users,
}

const ORGANIZATION_LINK: SidebarEntry = {
  to: "/dashboard/organization",
  label: "nav.organization",
  icon: Building2,
}

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

const DEVICES_LINK: SidebarEntry = {
  to: "/dashboard/devices",
  label: "nav.devices",
  icon: Laptop,
}

const SETTINGS_LINK: SidebarEntry = {
  to: "/dashboard/settings",
  label: "nav.settings",
  icon: SlidersHorizontal,
}

const PLATFORM_LINKS: SidebarEntry[] = [
  { to: ADMIN_ROUTE, label: "nav.admin", icon: Gauge, exact: true },
  { to: INBOX_ROUTE, label: "nav.adminInbox", icon: Inbox },
  { to: `${ADMIN_ROUTE}/users`, label: "nav.adminUsers", icon: UsersRound },
  {
    to: `${ADMIN_ROUTE}/organizations`,
    label: "nav.adminOrganizations",
    icon: Building2,
  },
  { to: `${ADMIN_ROUTE}/servers`, label: "nav.adminServers", icon: HardDrive },
  {
    to: `${ADMIN_ROUTE}/subscriptions`,
    label: "nav.adminSubscriptions",
    icon: CreditCard,
  },
  {
    to: `${ADMIN_ROUTE}/affiliate-links`,
    label: "nav.adminAffiliateLinks",
    icon: Link2,
  },
  { to: `${ADMIN_ROUTE}/events`, label: "nav.adminEvents", icon: ScrollText },
  { to: `${ADMIN_ROUTE}/releases`, label: "nav.adminReleases", icon: Package },
  { to: `${ADMIN_ROUTE}/team`, label: "nav.adminTeam", icon: Users },
]

/** The console's navigation, declared once: the column holds it, the panel borrows it. */
export function SidebarContent() {
  const t = useTranslations()
  const { role, entitlement, platformRole, activeOrganization } =
    useDashboardContext()
  const canManageBilling = usePermission("billing:manage")
  const canReadAudit = usePermission("audit:view")
  const platform = isPlatformOrganization(activeOrganization?.id)
  const onPlatform = platformOpen(activeOrganization?.id, platformRole)
  const inboxCounts = useQuery({
    ...inboxCountsQueryOptions(),
    enabled: onPlatform,
  })
  const open = (link: SidebarEntry) =>
    entitlement !== "suspended" || opensWhileSuspended(link.to)
  const groups = [
    {
      label: t("nav.group.organization"),
      links: [
        SERVERS_LINK,
        MEMBERS_LINK,
        ...(canReadAudit ? [AUDIT_LINK] : []),
        ...(canManageBilling && !platform ? [BILLING_LINK] : []),
        ...(canManageOrganization(role) ? [ORGANIZATION_LINK] : []),
      ].filter(open),
    },
    {
      label: t("nav.group.account"),
      links: [DEVICES_LINK, SETTINGS_LINK].filter(open),
    },
    {
      label: t("nav.group.platform"),
      links: onPlatform ? PLATFORM_LINKS : [],
      search: onPlatform,
    },
  ].filter((group) => group.links.length > 0)

  return (
    <>
      <div className="flex flex-col gap-4 p-3">
        <div className="px-1 pt-1">
          <ConsoleBrand />
        </div>

        <OrganizationSwitcher />
      </div>

      <nav
        aria-label={t("nav.mainMenu")}
        className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 pb-4"
      >
        <SidebarStartLink />

        {groups.map((group) => (
          <div key={group.label}>
            <p className="px-2.5 pb-1.5 text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
              {group.label}
            </p>
            <div className="flex flex-col gap-[2px]">
              {group.search ? <SidebarSearchButton /> : null}
              {group.links.map((link) => (
                <SidebarLink
                  badge={
                    link.to === INBOX_ROUTE
                      ? inboxCounts.data?.total_unread
                      : undefined
                  }
                  exact={link.exact}
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

      <div className="flex flex-col gap-2 border-line border-t p-3">
        <SidebarEntitlement />
        <SidebarAppCard />
        <SidebarAccountMenu />
      </div>
    </>
  )
}
