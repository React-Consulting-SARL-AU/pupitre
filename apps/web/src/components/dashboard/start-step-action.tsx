import { Link } from "@tanstack/react-router"
import { ArrowRight, Download, ExternalLink } from "lucide-react"
import { buttonClassName } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { useLocale, useTranslations } from "@/hooks/use-locale"
import { useSuggestedOffer } from "@/hooks/use-suggested-offer"
import { docsUrl, VPS_GUIDE_SLUG } from "@/lib/config/urls"
import { SERVER_REQUIREMENTS } from "@/lib/domain/downloads"
import type { OnboardingStep } from "@/lib/domain/onboarding"

export interface StartStepActionProps {
  step: OnboardingStep
}

const LINK =
  "inline-flex items-center gap-1.5 rounded-sm text-[13px] text-ink-2 transition-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"

export function StartStepAction({ step }: StartStepActionProps) {
  const t = useTranslations()
  const { locale } = useLocale()
  const { published, offer } = useSuggestedOffer()

  if (step.id === "app") {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {offer?.url ? (
          <a
            className={buttonClassName({ variant: "primary" })}
            href={offer.url}
          >
            <Download className="size-4 shrink-0" strokeWidth={1.5} />
            {t("download.get", { system: t(offer.label) })}
          </a>
        ) : null}

        {published ? null : (
          <p className="text-[13px] text-ink-3">
            {t("sidebar.app.unpublished")}
          </p>
        )}

        <Link className={LINK} to="/dashboard/download">
          {t("sidebar.app.all")}
          <ArrowRight className="size-3.5 shrink-0" strokeWidth={1.5} />
        </Link>
      </div>
    )
  }

  if (step.id === "server") {
    return (
      <div className="flex flex-col gap-3">
        <ul className="flex flex-col gap-1">
          {SERVER_REQUIREMENTS.map((requirement) => (
            <li className="text-[13px] text-ink-2" key={requirement}>
              {t(requirement)}
            </li>
          ))}
        </ul>

        <a
          className={LINK}
          href={docsUrl(VPS_GUIDE_SLUG, locale)}
          rel="noreferrer"
          target="_blank"
        >
          {t("onboarding.server.guide")}
          <ExternalLink className="size-3.5 shrink-0" strokeWidth={1.5} />
        </a>

        {step.inProgress ? (
          <Callout title={t("onboarding.server.enrolling")} />
        ) : null}
      </div>
    )
  }

  return null
}
