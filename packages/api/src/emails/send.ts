import {
  createLoggingSendEmail,
  type EmailLogger,
  type EmailMessage,
  type SendEmail,
} from "@pupitre/auth/emails"
import { EMAIL_FROM } from "./config"
import { buildMimeMessage, generateMessageId } from "./mime"

interface CloudflareEmailBinding {
  send(message: unknown): Promise<void>
}

interface CloudflareEmailModule {
  EmailMessage: new (from: string, to: string, raw: string) => unknown
}

function isBinding(value: unknown): value is CloudflareEmailBinding {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as CloudflareEmailBinding).send === "function"
  )
}

/**
 * `cloudflare:workers` and `cloudflare:email` only exist inside the Worker
 * runtime: the import has to be dynamic, and its failure is the signal that we
 * are running under Bun instead.
 */
export async function cloudflareEmailBinding(): Promise<CloudflareEmailBinding | null> {
  try {
    const { env } = (await import("cloudflare:workers")) as unknown as {
      env: Record<string, unknown>
    }
    const binding = env.EMAIL

    return isBinding(binding) ? binding : null
  } catch {
    return null
  }
}

async function cloudflareEmailMessage(): Promise<
  CloudflareEmailModule["EmailMessage"] | null
> {
  try {
    const { EmailMessage } = (await import(
      "cloudflare:email"
    )) as unknown as CloudflareEmailModule

    return EmailMessage
  } catch {
    return null
  }
}

export function createEmailSender(log?: EmailLogger): SendEmail {
  const fallback = createLoggingSendEmail(log)

  return async (message: EmailMessage) => {
    const [binding, Message] = await Promise.all([
      cloudflareEmailBinding(),
      cloudflareEmailMessage(),
    ])

    if (!(binding && Message)) {
      await fallback(message)

      return
    }

    const raw = buildMimeMessage({
      from: EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html ?? message.text,
      messageId: generateMessageId(),
    })

    await binding.send(new Message(EMAIL_FROM, message.to, raw))
  }
}
