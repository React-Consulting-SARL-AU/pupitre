import type { ReactNode } from "react"
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar"
import {
  DashboardContext,
  type DashboardContextValue,
} from "@/lib/domain/dashboard-context"

export interface DashboardShellProps {
  value: DashboardContextValue
  children: ReactNode
}

export function DashboardShell({ value, children }: DashboardShellProps) {
  return (
    <DashboardContext.Provider value={value}>
      <div className="flex flex-1 bg-base">
        <DashboardSidebar />
        <main className="min-w-0 flex-1 px-8 py-8">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </DashboardContext.Provider>
  )
}
