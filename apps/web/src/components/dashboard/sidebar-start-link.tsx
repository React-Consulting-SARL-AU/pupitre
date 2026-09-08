import { Rocket } from "lucide-react"
import { SidebarLink } from "@/components/dashboard/sidebar-link"
import { useTranslations } from "@/hooks/use-locale"
import { useOnboarding } from "@/hooks/use-onboarding"

export function SidebarStartLink() {
  const t = useTranslations()
  const { progress, complete, ready } = useOnboarding()

  if (!ready || complete) {
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
