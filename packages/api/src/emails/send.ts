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

const PRODUCTION = "production"

export class EmailBindingMissingError extends Error {
  constructor() {
    super("no EMAIL binding on the Worker: nothing can be sent in production")
    this.name = "EmailBindingMissingError"
  }
}

export interface EmailRuntime {
  binding: CloudflareEmailBinding | null
  Message: CloudflareEmailModule["EmailMessage"] | null
  environment: string | null
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
async function workerEnv(): Promise<Record<string, unknown> | null> {
  try {
    const { env } = (await import("cloudflare:workers")) as unknown as {
      env: Record<string, unknown>
    }

    return env
  } catch {
    return null
  }
}

export async function cloudflareEmailBinding(): Promise<CloudflareEmailBinding | null> {
  const binding = (await workerEnv())?.EMAIL

  return isBinding(binding) ? binding : null
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

async function cloudflareEmailRuntime(): Promise<EmailRuntime> {
  const [env, Message] = await Promise.all([
    workerEnv(),
    cloudflareEmailMessage(),
  ])
  const binding = env?.EMAIL
  const environment = env?.PUPITRE_ENVIRONMENT

  return {
    binding: isBinding(binding) ? binding : null,
    Message,
    environment: typeof environment === "string" ? environment : null,
  }
}

/**
 * Without the binding, the message goes to the log — which is what
 * development wants, and what production must never do quietly: a magic
 * link that only reaches the log locks the person out without a word.
 */
export function createEmailSender(
  log?: EmailLogger,
  runtime: () => Promise<EmailRuntime> = cloudflareEmailRuntime
): SendEmail {
  const fallback = createLoggingSendEmail(log)

  return async (message: EmailMessage) => {
    const { binding, Message, environment } = await runtime()

    if (!(binding && Message)) {
      if (environment === PRODUCTION) {
        throw new EmailBindingMissingError()
      }

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
