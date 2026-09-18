import {
  configureMailStorage,
  createMailUrlSigner,
  type MailObject,
  type MailSignedMethod,
  type MailSignedUrlOptions,
  type MailStorage,
  resetMailStorage,
} from "../lib/mail/storage"
import {
  configureMailTransport,
  type OutboundEnvelope,
  resetMailTransport,
} from "../lib/mail/transport"

export interface SignedMailRequest extends MailSignedUrlOptions {
  method: MailSignedMethod
  key: string
}

export interface FakeMail {
  objects: Map<string, MailObject>
  /** When each object landed: a test backdates an upload here to see it purged. */
  uploaded: Map<string, Date>
  sent: OutboundEnvelope[]
  signed: SignedMailRequest[]
  storage: MailStorage
}

export const FAKE_MAIL_SIGNER_CONFIG = {
  accountId: "acc123",
  accessKeyId: "AKIAEXAMPLE",
  secretAccessKey: "secret-example",
  bucketName: "ppt-mail",
}

function createFakeMailStorage(
  objects: Map<string, MailObject>,
  uploaded: Map<string, Date>,
  signed: SignedMailRequest[]
): MailStorage {
  const sign = createMailUrlSigner(FAKE_MAIL_SIGNER_CONFIG)

  return {
    put: (key, body, contentType) => {
      objects.set(key, { body, contentType })
      uploaded.set(key, new Date())

      return Promise.resolve()
    },
    get: (key) => Promise.resolve(objects.get(key) ?? null),
    head: (key) => {
      const object = objects.get(key)

      return Promise.resolve(
        object
          ? { size: object.body.byteLength, contentType: object.contentType }
          : null
      )
    },
    list: (prefix) =>
      Promise.resolve(
        [...objects.keys()]
          .filter((key) => key.startsWith(prefix))
          .map((key) => ({ key, uploaded: uploaded.get(key) ?? new Date() }))
      ),
    delete: (key) => {
      objects.delete(key)
      uploaded.delete(key)

      return Promise.resolve()
    },
    signedUrl: (method, key, options) => {
      signed.push({ method, key, ...options })

      return sign(method, key, options)
    },
  }
}

/**
 * The bucket and the sending binding only exist inside the Worker: a test
 * keeps both in memory and reads back what the ingestion wrote.
 */
export function useFakeMail(): FakeMail {
  const objects = new Map<string, MailObject>()
  const uploaded = new Map<string, Date>()
  const sent: OutboundEnvelope[] = []
  const signed: SignedMailRequest[] = []
  const storage = createFakeMailStorage(objects, uploaded, signed)

  configureMailStorage(storage)
  configureMailTransport((envelope) => {
    sent.push(envelope)

    return Promise.resolve()
  })

  return { objects, uploaded, sent, signed, storage }
}

export function useFailingMailTransport(error: Error): void {
  configureMailTransport(() => Promise.reject(error))
}

export function resetFakeMail(): void {
  resetMailStorage()
  resetMailTransport()
}

export function textOf(object: MailObject | null | undefined): string {
  return object ? new TextDecoder().decode(object.body) : ""
}
