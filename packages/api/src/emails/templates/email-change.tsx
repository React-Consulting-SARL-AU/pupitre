import type { Locale } from "@pupitre/shared/i18n"
import { EmailLayout } from "../components/layout"
import {
  EmailButton,
  EmailData,
  EmailFootnote,
  EmailParagraph,
  EmailTitle,
  EmailTrouble,
} from "../components/pieces"
import { emailTranslator } from "../i18n"

export interface EmailChangeEmailProps {
  locale: Locale
  url: string
  newEmail: string
}

export function EmailChangeEmail({
  locale,
  url,
  newEmail,
}: EmailChangeEmailProps) {
  const t = emailTranslator(locale)

  return (
    <EmailLayout locale={locale} preview={t("email_change.preview")} t={t}>
      <EmailTitle>{t("email_change.title")}</EmailTitle>
      <EmailParagraph>{t("email_change.body")}</EmailParagraph>
      <EmailData
        fields={[{ label: t("label.new_email"), value: newEmail, mono: false }]}
      />
      <EmailButton url={url}>{t("email_change.cta")}</EmailButton>
      <EmailTrouble label={t("common.trouble")} url={url} />
      <EmailFootnote>{t("email_change.footnote")}</EmailFootnote>
    </EmailLayout>
  )
}
