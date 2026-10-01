import { Lock } from "lucide-react"
import { StartChecklist } from "@/components/dashboard/start-checklist"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"

export function StartPanel() {
  const t = useTranslations()
  const { activeOrganization } = useDashboardContext()

  if (!activeOrganization) {
    return (
      <EmptyState
        description={t("licensePanel.noOrganizationDescription")}
        icon={Lock}
        title={t("licensePanel.noOrganizationTitle")}
      />
    )
  }

  return (
    <div className="flex flex-col gap-section">
      <PageHeader
        mark={
          <span
            aria-hidden="true"
            className="flex size-11 items-center justify-center rounded-md bg-inverse font-data text-[16px] text-inverse-ink"
          >
            &gt;_
          </span>
        }
        title={t("start.heroTitle")}
      />

      <StartChecklist />
    </div>
  )
}
