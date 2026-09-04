import type { Locale } from "../../lib/i18n"
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

export interface InvitationEmailProps {
  locale: Locale
  url: string
  organizationName: string
  inviterEmail: string
}

export function InvitationEmail({
  locale,
  url,
  organizationName,
  inviterEmail,
}: InvitationEmailProps) {
  const t = emailTranslator(locale)
  const params = { organization: organizationName, inviter: inviterEmail }

  return (
    <EmailLayout
      locale={locale}
      preview={t("invitation.preview", params)}
      t={t}
    >
      <EmailTitle>{t("invitation.title", params)}</EmailTitle>
      <EmailParagraph>{t("invitation.body", params)}</EmailParagraph>
      <EmailData
        fields={[
          {
            label: t("label.organization"),
            value: organizationName,
            mono: false,
          },
          { label: t("label.inviter"), value: inviterEmail },
        ]}
      />
      <EmailButton url={url}>{t("invitation.cta")}</EmailButton>
      <EmailTrouble label={t("common.trouble")} url={url} />
      <EmailFootnote>{t("invitation.footnote")}</EmailFootnote>
    </EmailLayout>
  )
}
