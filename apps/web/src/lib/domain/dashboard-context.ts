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
  }
  organizations: (DashboardOrganization & { role: string })[]
  activeOrganization: DashboardOrganization | null
  role: OrgRole | null
  entitlement: string
}

export const DashboardContext = createContext<DashboardContextValue | null>(
  null
)
