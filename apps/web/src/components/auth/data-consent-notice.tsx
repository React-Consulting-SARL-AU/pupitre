import { Link } from "@tanstack/react-router"
import { useLocale, useTranslations } from "@/hooks/use-locale"
import { ACCOUNT_SETTINGS_ROUTE } from "@/lib/domain/consent-gate"
import { legalUrl } from "@/lib/domain/legal-pages"
import type { DictionaryKey } from "@/lib/i18n/en"

const POINTS: readonly { label: DictionaryKey; body: DictionaryKey }[] = [
  { label: "auth.consent.whatLabel", body: "auth.consent.what" },
  { label: "auth.consent.whereLabel", body: "auth.consent.where" },
  { label: "auth.consent.whyLabel", body: "auth.consent.why" },
  { label: "auth.consent.othersLabel", body: "auth.consent.others" },
]

export function DataConsentNotice() {
  const t = useTranslations()
  const { locale } = useLocale()

  return (
    <div className="flex flex-col gap-4 text-[13px] text-ink-2 leading-[1.55]">
      <dl className="flex flex-col gap-3">
        {POINTS.map((point) => (
          <div key={point.label}>
            <dt className="text-label">{t(point.label)}</dt>
            <dd className="mt-0.5 text-ink">{t(point.body)}</dd>
          </div>
        ))}
        <div>
          <dt className="text-label">{t("auth.consent.withdrawLabel")}</dt>
          <dd className="mt-0.5 text-ink">
            {t("auth.consent.withdraw")}{" "}
            <Link
              className="underline underline-offset-2 hover:text-ink-2"
              to={ACCOUNT_SETTINGS_ROUTE}
            >
              {t("auth.consent.withdrawLink")}
            </Link>
          </dd>
        </div>
      </dl>
      <a
        className="self-start underline underline-offset-2 hover:text-ink"
        href={legalUrl("privacy", locale)}
        rel="noopener"
        target="_blank"
      >
        {t("auth.consent.privacyLink")}
      </a>
    </div>
  )
}
