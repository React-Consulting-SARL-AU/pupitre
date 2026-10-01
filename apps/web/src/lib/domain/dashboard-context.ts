import type { Locale } from "@pupitre/shared/i18n"
import type { OrgRole } from "@pupitre/shared/permissions"
import type { OrganizationState } from "@pupitre/shared/platform"
import { createContext } from "react"

export interface DashboardOrganization {
  id: string
  name: string
  slug: string
  state: OrganizationState
}

export interface DashboardActiveOrganization extends DashboardOrganization {
  reason: string | null
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
  activeOrganization: DashboardActiveOrganization | null
  role: OrgRole | null
  license: string
  platformRole: OrgRole | null
  platformCanAct: boolean
}

export const DashboardContext = createContext<DashboardContextValue | null>(
  null
)
