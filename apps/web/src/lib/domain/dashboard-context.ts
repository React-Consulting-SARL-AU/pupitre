import type { Locale } from "@pupitre/shared/i18n"
import type { OrgRole } from "@pupitre/shared/permissions"
import { createContext } from "react"

export interface DashboardOrganization {
  id: string
  name: string
  slug: string
}

export interface DashboardContextValue {
  user: {
    id: string
    email: string
    name: string
    image: string | null
    locale: Locale
  }
  organizations: (DashboardOrganization & { role: string })[]
  activeOrganization: DashboardOrganization | null
  role: OrgRole | null
  entitlement: string
  /** The role held in the platform organization: it opens the platform pages whatever the active organisation. */
  platformRole: OrgRole | null
}

export const DashboardContext = createContext<DashboardContextValue | null>(
  null
)
