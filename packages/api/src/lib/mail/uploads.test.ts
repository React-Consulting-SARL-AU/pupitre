import { afterAll, beforeEach, describe, expect, it } from "bun:test"
import {
  MAIL_MAX_OUTBOUND_ATTACHMENT_BYTES,
  MAIL_SIGNED_URL_TTL_SECONDS,
} from "@pupitre/shared/legal"
import { resetFakeMail, useFakeMail } from "../../testing/mail"
import {
  assertMailAttachments,
  createMailUpload,
  MAIL_UPLOAD_MAX_AGE_MS,
  MailAttachmentRefusedError,
  purgeStaleMailUploads,
  readMailUploads,
} from "./uploads"

const NOW = new Date("2026-09-18T10:00:00Z")

const HOUR_MS = 3_600_000

const UPLOAD_KEY_RE = /^mail\/uploads\/user_1\/[0-9a-f-]{36}\/rapport_t_.pdf$/

function bytes(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer
}

function refusal(run: () => unknown): Promise<string> {
  return Promise.resolve()
    .then(run)
    .then(
      () => "none",
      (error: unknown) =>
        error instanceof MailAttachmentRefusedError ? error.reason : "other"
    )
}

describe("createMailUpload", () => {
  let mail: ReturnType<typeof useFakeMail>

  beforeEach(() => {
    mail = useFakeMail()
  })

  afterAll(() => {
    resetFakeMail()
  })

  it("signe un dépôt sous l'utilisateur, avec un nom assaini et dix minutes de validité", async () => {
    const grant = await createMailUpload(
      "user_1",
      {
        filename: "../rapport été.pdf",
        mime_type: "application/pdf",
        size: 10,
      },
      NOW
    )

    expect(grant.key).toMatch(UPLOAD_KEY_RE)
    expect(grant.expires_at).toEqual(
      new Date(NOW.getTime() + MAIL_SIGNED_URL_TTL_SECONDS * 1000)
    )
    expect(new URL(grant.url).pathname).toBe(`/ppt-mail/${grant.key}`)
    expect(mail.signed).toEqual([
      {
        method: "PUT",
        key: grant.key,
        ttlSeconds: MAIL_SIGNED_URL_TTL_SECONDS,
      },
    ])
  })

  it("refuse un exécutable avant de signer quoi que ce soit", async () => {
    expect(
      await refusal(() =>
        createMailUpload(
          "user_1",
          {
            filename: "setup.exe",
            mime_type: "application/octet-stream",
            size: 10,
          },
          NOW
        )
      )
    ).toBe("blocked")
    expect(mail.signed).toHaveLength(0)
  })
})

describe("assertMailAttachments", () => {
  const attachment = {
    key: "mail/uploads/user_1/uuid/rapport.pdf",
    filename: "rapport.pdf",
    mime_type: "application/pdf",
    size: 10,
  }

  it("accepte des dépôts de l'appelant sous le plafond", () => {
    expect(() => assertMailAttachments("user_1", [attachment])).not.toThrow()
  })

  it("refuse un dépôt d'un autre utilisateur", async () => {
    expect(
      await refusal(() => assertMailAttachments("user_2", [attachment]))
    ).toBe("foreign")
  })

  it("refuse une clé qui remonte hors du préfixe", async () => {
    expect(
      await refusal(() =>
        assertMailAttachments("user_1", [
          { ...attachment, key: "mail/uploads/user_1/../inbound/x/raw.eml" },
        ])
      )
    ).toBe("foreign")
  })

  it("refuse un total au-dessus de cinq mébioctets", async () => {
    expect(
      await refusal(() =>
        assertMailAttachments("user_1", [
          { ...attachment, size: MAIL_MAX_OUTBOUND_ATTACHMENT_BYTES },
          { ...attachment, key: "mail/uploads/user_1/uuid2/b.pdf", size: 1 },
        ])
      )
    ).toBe("too_large")
  })

  it("refuse un nom d'exécutable même sur une clé valide", async () => {
    expect(
      await refusal(() =>
        assertMailAttachments("user_1", [{ ...attachment, filename: "a.js" }])
      )
    ).toBe("blocked")
  })
})

describe("readMailUploads", () => {
  let mail: ReturnType<typeof useFakeMail>

  beforeEach(() => {
    mail = useFakeMail()
  })

  afterAll(() => {
    resetFakeMail()
  })

  it("lit les octets de chaque dépôt annoncé", async () => {
    mail.objects.set("mail/uploads/user_1/uuid/a.txt", {
      body: bytes("abc"),
      contentType: "text/plain",
    })

    const read = await readMailUploads([
      {
        key: "mail/uploads/user_1/uuid/a.txt",
        filename: "a.txt",
        mime_type: "text/plain",
        size: 3,
      },
    ])

    expect(read).toHaveLength(1)
    expect(new TextDecoder().decode(read[0].body)).toBe("abc")
    expect(read[0].mimeType).toBe("text/plain")
  })

  it("refuse un dépôt absent du seau", async () => {
    expect(
      await refusal(() =>
        readMailUploads([
          {
            key: "mail/uploads/user_1/uuid/a.txt",
            filename: "a.txt",
            mime_type: "text/plain",
            size: 3,
          },
        ])
      )
    ).toBe("missing")
  })

  it("refuse un dépôt plus gros qu'annoncé", async () => {
    mail.objects.set("mail/uploads/user_1/uuid/a.txt", {
      body: bytes("abcdef"),
      contentType: "text/plain",
    })

    expect(
      await refusal(() =>
        readMailUploads([
          {
            key: "mail/uploads/user_1/uuid/a.txt",
            filename: "a.txt",
            mime_type: "text/plain",
            size: 3,
          },
        ])
      )
    ).toBe("size_mismatch")
  })
})

describe("purgeStaleMailUploads", () => {
  let mail: ReturnType<typeof useFakeMail>

  beforeEach(() => {
    mail = useFakeMail()
  })

  afterAll(() => {
    resetFakeMail()
  })

  it("efface les dépôts de plus de vingt-quatre heures et laisse le reste", async () => {
    const stale = "mail/uploads/user_1/old/a.txt"
    const fresh = "mail/uploads/user_1/new/b.txt"
    const filed = "mail/thread_1/id/attachments/0/c.txt"

    for (const key of [stale, fresh, filed]) {
      mail.objects.set(key, { body: bytes("x"), contentType: "text/plain" })
    }

    mail.uploaded.set(
      stale,
      new Date(NOW.getTime() - MAIL_UPLOAD_MAX_AGE_MS - HOUR_MS)
    )
    mail.uploaded.set(fresh, new Date(NOW.getTime() - HOUR_MS))
    mail.uploaded.set(
      filed,
      new Date(NOW.getTime() - 10 * MAIL_UPLOAD_MAX_AGE_MS)
    )

    expect(await purgeStaleMailUploads(NOW)).toEqual([stale])
    expect([...mail.objects.keys()].sort()).toEqual([filed, fresh].sort())
  })

  it("ne fait rien sans dépôt en attente", async () => {
    expect(await purgeStaleMailUploads(NOW)).toEqual([])
  })
})
