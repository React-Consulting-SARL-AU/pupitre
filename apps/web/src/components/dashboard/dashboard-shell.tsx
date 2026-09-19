import type { ReactNode } from "react"
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar"
import { MobileNav } from "@/components/dashboard/mobile-nav"
import { OrganizationStandingBanner } from "@/components/dashboard/organization-standing-banner"
import { ToastProvider } from "@/components/ui/toast"
import { useTranslations } from "@/hooks/use-locale"
import {
  DashboardContext,
  type DashboardContextValue,
} from "@/lib/domain/dashboard-context"

export interface DashboardShellProps {
  value: DashboardContextValue
  children: ReactNode
}

const MAIN_ID = "console-main"

export function DashboardShell({ value, children }: DashboardShellProps) {
  const t = useTranslations()

  return (
    <DashboardContext.Provider value={value}>
      <ToastProvider>
        <div className="flex min-w-0 flex-1 flex-col">
          <a
            className="sr-only rounded-md bg-surface px-4 py-2 text-[13px] text-ink shadow-overlay focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:outline-2 focus:outline-ink focus:outline-offset-2"
            href={`#${MAIN_ID}`}
          >
            {t("nav.skipToContent")}
          </a>

          <MobileNav />

          <div className="flex flex-1 bg-base">
            <DashboardSidebar />
            <main
              className="min-w-0 flex-1 px-4 py-6 lg:px-10 lg:py-10"
              id={MAIN_ID}
            >
              <div className="mx-auto max-w-5xl">
                <OrganizationStandingBanner />
                {children}
              </div>
            </main>
          </div>
        </div>
      </ToastProvider>
    </DashboardContext.Provider>
  )
}
