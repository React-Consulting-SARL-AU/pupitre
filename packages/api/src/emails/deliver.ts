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

/**
 * A business action never fails because an email did: the caller gets a
 * verdict, and the failure lands in the log without the message body.
 */
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
