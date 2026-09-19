import { LEGAL_CONTACTS } from "@pupitre/shared/legal"
import type { OrganizationState } from "@pupitre/shared/platform"
import { StatusDot } from "@/components/ui/status-dot"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import type { DictionaryKey } from "@/lib/i18n/en"

const STANDING_KEYS: Record<
  Exclude<OrganizationState, "active">,
  DictionaryKey
> = {
  suspended: "organization.standing.suspended",
  closed: "organization.standing.closed",
  deleting: "organization.standing.deleting",
}

export function OrganizationStandingBanner() {
  const t = useTranslations()
  const { activeOrganization } = useDashboardContext()

  if (!activeOrganization || activeOrganization.state === "active") {
    return null
  }

  const params = { organization: activeOrganization.name }

  return (
    <div
      className="mb-gutter flex flex-col gap-2 rounded-md bg-surface px-4 py-3 shadow-raised"
      data-testid="organization-standing-banner"
      role="status"
    >
      <div className="flex items-center gap-3">
        <StatusDot
          label={activeOrganization.state}
          shape="barred"
          tone="danger"
        />
        <p className="text-[13px] text-ink">
          {t(STANDING_KEYS[activeOrganization.state], params)}
        </p>
      </div>

      {activeOrganization.reason ? (
        <p className="text-[13px] text-ink-2">
          {t("organization.standing.reason", {
            reason: activeOrganization.reason,
          })}
        </p>
      ) : null}

      <p className="text-[13px] text-ink-3">
        {t("organization.standing.fix", {
          ...params,
          email: LEGAL_CONTACTS.support,
        })}
      </p>
    </div>
  )
}
