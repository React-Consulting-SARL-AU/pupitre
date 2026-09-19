import { Rocket } from "lucide-react"
import { SidebarLink } from "@/components/dashboard/sidebar-link"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { useOnboarding } from "@/hooks/use-onboarding"
import { isPlatformOrganization } from "@/lib/domain/admin"

export function SidebarStartLink() {
  const t = useTranslations()
  const { activeOrganization } = useDashboardContext()
  const { progress, complete, ready } = useOnboarding()

  if (!ready || complete || isPlatformOrganization(activeOrganization?.id)) {
    return null
  }

  return (
    <SidebarLink
      icon={Rocket}
      label={t("sidebar.start", {
        done: progress.done,
        total: progress.total,
      })}
      to="/dashboard/start"
    />
  )
}
