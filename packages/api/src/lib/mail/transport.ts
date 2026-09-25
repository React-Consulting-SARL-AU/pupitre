import {
  cloudflareEmailBinding,
  cloudflareEmailMessage,
} from "../../emails/send"

export interface OutboundEnvelope {
  from: string
  to: string[]
  cc: string[]
  raw: string
}

export type MailTransport = (envelope: OutboundEnvelope) => Promise<void>

export class MailTransportMissingError extends Error {
  constructor() {
    super("no EMAIL binding on the Worker: no answer can leave the console")
    this.name = "MailTransportMissingError"
  }
}

let configured: MailTransport | null = null

export function configureMailTransport(transport: MailTransport): void {
  configured = transport
}

export function resetMailTransport(): void {
  configured = null
}

// Email Sending takes one recipient per message, so the envelope is fanned out.
const cloudflareTransport: MailTransport = async (envelope) => {
  const [binding, Message] = await Promise.all([
    cloudflareEmailBinding(),
    cloudflareEmailMessage(),
  ])

  if (!(binding && Message)) {
    throw new MailTransportMissingError()
  }

  for (const recipient of [...envelope.to, ...envelope.cc]) {
    await binding.send(new Message(envelope.from, recipient, envelope.raw))
  }
}

export function mailTransport(): MailTransport {
  return configured ?? cloudflareTransport
}
