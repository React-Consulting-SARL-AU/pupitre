import type {
  AuthEmailRenderer,
  EmailMessage,
  InvitationEmailInput,
  MagicLinkEmailInput,
} from "@pupitre/auth/emails"
import { localeOf } from "../lib/i18n"
import { renderInvitationEmail, renderMagicLinkEmail } from "./render"

export const authEmails: AuthEmailRenderer = {
  async magicLink(input: MagicLinkEmailInput): Promise<EmailMessage> {
    const rendered = await renderMagicLinkEmail({
      locale: localeOf(input.acceptLanguage),
      url: input.url,
    })

    return { to: input.to, ...rendered }
  },

  async invitation(input: InvitationEmailInput): Promise<EmailMessage> {
    const rendered = await renderInvitationEmail({
      locale: localeOf(input.acceptLanguage),
      url: input.url,
      organizationName: input.organizationName,
      inviterEmail: input.inviterEmail,
    })

    return { to: input.to, ...rendered }
  },
}
