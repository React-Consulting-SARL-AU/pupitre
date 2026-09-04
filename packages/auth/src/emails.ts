export interface EmailMessage {
  to: string
  subject: string
  text: string
}

export type SendEmail = (message: EmailMessage) => Promise<void>

export type EmailLogger = (line: string) => void

const TOKEN_QUERY_RE = /([?&]token=)[^&\s]+/g

export function redactTokens(text: string): string {
  return text.replace(TOKEN_QUERY_RE, "$1[redacted]")
}

export function magicLinkEmail(to: string, url: string): EmailMessage {
  return {
    to,
    subject: "Votre lien de connexion Pupitre",
    text: [
      "Connectez-vous à Pupitre en ouvrant ce lien :",
      "",
      url,
      "",
      "Il expire dans 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.",
    ].join("\n"),
  }
}

export interface InvitationEmailInput {
  to: string
  url: string
  organizationName: string
  inviterEmail: string
}

export function invitationEmail(input: InvitationEmailInput): EmailMessage {
  return {
    to: input.to,
    subject: `Invitation à rejoindre ${input.organizationName} sur Pupitre`,
    text: [
      `${input.inviterEmail} vous invite à rejoindre l'organisation ${input.organizationName} sur Pupitre.`,
      "",
      "Acceptez l'invitation en ouvrant ce lien :",
      "",
      input.url,
      "",
      "Elle expire dans 7 jours.",
    ].join("\n"),
  }
}

export function createLoggingSendEmail(
  log: EmailLogger = (line) => console.info(line)
): SendEmail {
  return (message) => {
    log(
      `[auth email] to=${message.to} subject="${message.subject}"\n${redactTokens(message.text)}`
    )

    return Promise.resolve()
  }
}
