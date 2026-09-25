import type { EmailMessage, SendEmail } from "@pupitre/auth/emails"
import { sendEmailFor } from "@pupitre/auth/server"
import { getApiAuth } from "../lib/api/plugins/auth"

export interface DeliverOptions {
  send?: SendEmail
  onFailure?: (error: unknown) => void
}

function reportFailure(message: EmailMessage, error: unknown): void {
  console.error(`[api] email failed subject="${message.subject}"`, error)
}

/** Never throws: a business action must not fail because an email did. */
export async function deliver(
  message: EmailMessage,
  options: DeliverOptions = {}
): Promise<boolean> {
  const send = options.send ?? sendEmailFor(getApiAuth())

  try {
    await send(message)

    return true
  } catch (error) {
    if (options.onFailure) {
      options.onFailure(error)
    } else {
      reportFailure(message, error)
    }

    return false
  }
}
