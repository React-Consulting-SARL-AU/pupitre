import { Link } from "@tanstack/react-router"
import { StatusDot } from "@/components/ui/status-dot"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { usePermission } from "@/hooks/use-permission"
import { licenseNotice } from "@/lib/domain/onboarding"

const SHELL =
  "flex items-center gap-2 rounded-md bg-sunken px-2.5 py-2 text-[12px] text-ink-2"

export function SidebarLicense() {
  const t = useTranslations()
  const { license } = useDashboardContext()
  const canManageBilling = usePermission("billing:manage")
  const notice = licenseNotice({ license, canManageBilling })

  if (!notice) {
    return null
  }

  const label = t(notice.label)

  const body = (
    <>
      <StatusDot
        label={label}
        shape={notice.look.shape}
        tone={notice.look.tone}
      />
      <span className="truncate">{label}</span>
    </>
  )

  if (!notice.to) {
    return <p className={SHELL}>{body}</p>
  }

  return (
    <Link
      className={`${SHELL} transition-fast hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2`}
      to={notice.to}
    >
      {body}
    </Link>
  )
}
