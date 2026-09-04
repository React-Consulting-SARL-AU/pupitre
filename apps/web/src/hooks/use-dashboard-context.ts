import { useContext } from "react"
import {
  DashboardContext,
  type DashboardContextValue,
} from "@/lib/domain/dashboard-context"

export function useDashboardContext(): DashboardContextValue {
  const value = useContext(DashboardContext)

  if (!value) {
    throw new Error("useDashboardContext must be used inside the dashboard")
  }

  return value
}
