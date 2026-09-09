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

/**
 * The templates live in `packages/api/src/emails`, which already depends on
 * this package: they reach Better Auth through this port rather than the other
 * way round, and `packages/api/src/server.ts` fills it in.
 */
export interface AuthEmailRenderer {
  magicLink(input: MagicLinkEmailInput): Promise<EmailMessage>
  invitation(input: InvitationEmailInput): Promise<EmailMessage>
  emailChange(input: EmailChangeEmailInput): Promise<EmailMessage>
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
