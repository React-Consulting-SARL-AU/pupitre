import type {
  AuthEmailRenderer,
  EmailChangeEmailInput,
  EmailMessage,
  InvitationEmailInput,
  MagicLinkEmailInput,
} from "@pupitre/auth/emails"
import { localeOf } from "@pupitre/shared/i18n"
import {
  renderEmailChangeEmail,
  renderInvitationEmail,
  renderMagicLinkEmail,
} from "./render"

export const authEmails: AuthEmailRenderer = {
  async magicLink(input: MagicLinkEmailInput): Promise<EmailMessage> {
    const rendered = await renderMagicLinkEmail({
      locale: localeOf(input.acceptLanguage),
      url: input.url,
    })

    return { to: input.to, ...rendered }
  },

  async emailChange(input: EmailChangeEmailInput): Promise<EmailMessage> {
    const rendered = await renderEmailChangeEmail({
      locale: localeOf(input.acceptLanguage),
      url: input.url,
      newEmail: input.newEmail,
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
