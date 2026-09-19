import type { Locale } from "@pupitre/shared/i18n"
import { EmailLayout } from "../components/layout"
import {
  EmailButton,
  EmailFootnote,
  EmailParagraph,
  EmailTitle,
  EmailTrouble,
} from "../components/pieces"
import { emailTranslator } from "../i18n"

export interface EmailVerificationEmailProps {
  locale: Locale
  url: string
}

export function EmailVerificationEmail({
  locale,
  url,
}: EmailVerificationEmailProps) {
  const t = emailTranslator(locale)

  return (
    <EmailLayout
      locale={locale}
      preview={t("email_verification.preview")}
      t={t}
    >
      <EmailTitle>{t("email_verification.title")}</EmailTitle>
      <EmailParagraph>{t("email_verification.body")}</EmailParagraph>
      <EmailButton url={url}>{t("email_verification.cta")}</EmailButton>
      <EmailTrouble label={t("common.trouble")} url={url} />
      <EmailFootnote>{t("email_verification.footnote")}</EmailFootnote>
    </EmailLayout>
  )
}
