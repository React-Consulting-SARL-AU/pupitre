import type { Locale } from "../../lib/i18n"
import { EmailLayout } from "../components/layout"
import {
  EmailButton,
  EmailFootnote,
  EmailParagraph,
  EmailTitle,
  EmailTrouble,
} from "../components/pieces"
import { emailTranslator } from "../i18n"

export interface MagicLinkEmailProps {
  locale: Locale
  url: string
}

export function MagicLinkEmail({ locale, url }: MagicLinkEmailProps) {
  const t = emailTranslator(locale)

  return (
    <EmailLayout locale={locale} preview={t("magic_link.preview")} t={t}>
      <EmailTitle>{t("magic_link.title")}</EmailTitle>
      <EmailParagraph>{t("magic_link.body")}</EmailParagraph>
      <EmailButton url={url}>{t("magic_link.cta")}</EmailButton>
      <EmailTrouble label={t("common.trouble")} url={url} />
      <EmailFootnote>{t("magic_link.footnote")}</EmailFootnote>
    </EmailLayout>
  )
}
