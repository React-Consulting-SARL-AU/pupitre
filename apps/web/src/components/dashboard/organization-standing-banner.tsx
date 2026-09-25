import { LEGAL_CONTACTS } from "@pupitre/shared/legal"
import type { OrganizationState } from "@pupitre/shared/platform"
import { ArrowLeftRight } from "lucide-react"
import { OrganizationSwitcher } from "@/components/dashboard/organization-switcher"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
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

// Nothing inside a closed organization reopens it: the way out is another organization.
const LOCKED_OUT: OrganizationState[] = ["closed", "deleting"]

export function OrganizationStandingBanner() {
  const t = useTranslations()
  const { activeOrganization } = useDashboardContext()

  if (!activeOrganization || activeOrganization.state === "active") {
    return null
  }

  const params = { organization: activeOrganization.name }

  return (
    <Callout
      action={
        LOCKED_OUT.includes(activeOrganization.state) ? (
          <OrganizationSwitcher
            trigger={
              <Button icon={ArrowLeftRight} size="sm">
                {t("organization.standing.switch")}
              </Button>
            }
          />
        ) : undefined
      }
      className="mb-gutter"
      data-testid="organization-standing-banner"
      fix={t("organization.standing.fix", {
        ...params,
        email: LEGAL_CONTACTS.support,
      })}
      title={t(STANDING_KEYS[activeOrganization.state], params)}
      tone="danger"
    >
      {activeOrganization.reason ? (
        <p className="mt-1 text-ink-2">
          {t("organization.standing.reason", {
            reason: activeOrganization.reason,
          })}
        </p>
      ) : null}
    </Callout>
  )
}
