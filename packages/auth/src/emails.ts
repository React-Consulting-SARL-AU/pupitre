export interface EmailMessage {
  to: string
  subject: string
  text: string
  html?: string
}

export type SendEmail = (message: EmailMessage) => Promise<void>

export type EmailLogger = (line: string) => void

export interface MagicLinkEmailInput {
  to: string
  url: string
  acceptLanguage: string | null
}

export interface InvitationEmailInput {
  to: string
  url: string
  organizationName: string
  inviterEmail: string
  acceptLanguage: string | null
}

export interface EmailChangeEmailInput {
  to: string
  newEmail: string
  url: string
  acceptLanguage: string | null
}

export interface EmailVerificationEmailInput {
  to: string
  url: string
  acceptLanguage: string | null
}

/** Injected by `@pupitre/api`, which depends on this package and owns the templates. */
export interface AuthEmailRenderer {
  magicLink(input: MagicLinkEmailInput): Promise<EmailMessage>
  invitation(input: InvitationEmailInput): Promise<EmailMessage>
  emailChange(input: EmailChangeEmailInput): Promise<EmailMessage>
  emailVerification(input: EmailVerificationEmailInput): Promise<EmailMessage>
}

export class AuthEmailsNotConfiguredError extends Error {
  constructor() {
    super(
      "no auth email renderer: import @pupitre/api/server before serving auth requests"
    )
    this.name = "AuthEmailsNotConfiguredError"
  }
}

const TOKEN_QUERY_RE = /([?&]token=)[^&\s"'<>]+/g

export function redactTokens(text: string): string {
  return text.replace(TOKEN_QUERY_RE, "$1[redacted]")
}

export function createLoggingSendEmail(
  log: EmailLogger = (line) => console.info(line)
): SendEmail {
  return (message) => {
    log(
      `[auth email] to=${message.to} subject="${redactTokens(message.subject)}"\n${redactTokens(message.text)}`
    )

    return Promise.resolve()
  }
}

let renderer: AuthEmailRenderer | null = null

let configuredSender: SendEmail | null = null

export interface AuthEmailsConfig {
  renderer: AuthEmailRenderer
  sendEmail?: SendEmail
}

export function configureAuthEmails(config: AuthEmailsConfig): void {
  renderer = config.renderer

  if (config.sendEmail) {
    configuredSender = config.sendEmail
  }
}

export function authEmailRenderer(): AuthEmailRenderer {
  if (!renderer) {
    throw new AuthEmailsNotConfiguredError()
  }

  return renderer
}

export function configuredSendEmail(): SendEmail | null {
  return configuredSender
}
