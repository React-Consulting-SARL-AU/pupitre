import { describe, expect, it } from "bun:test"
import { createMailUrlSigner, mailUploadKey, rawKeyFor } from "./storage"

const CONFIG = {
  accountId: "acc123",
  accessKeyId: "AKIAEXAMPLE",
  secretAccessKey: "secret-example",
  bucketName: "ppt-mail",
}

const NOW = new Date("2026-09-18T10:20:30Z")

const UPLOAD_KEY_RE = /^mail\/uploads\/user_1\/[0-9a-f-]{36}\/rapport_t_.pdf$/

describe("createMailUrlSigner", () => {
  it("signe une lecture sur le seau des mails, avec la disposition et le type demandés", async () => {
    const url = new URL(
      await createMailUrlSigner(CONFIG, () => NOW)(
        "GET",
        "mail/inbound/abc/attachments/0/rapport.pdf",
        {
          ttlSeconds: 600,
          disposition: 'inline; filename="rapport.pdf"',
          contentType: "application/pdf",
        }
      )
    )

    expect(url.hostname).toBe("acc123.r2.cloudflarestorage.com")
    expect(url.pathname).toBe(
      "/ppt-mail/mail/inbound/abc/attachments/0/rapport.pdf"
    )
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600")
    expect(url.searchParams.get("X-Amz-Date")).toBe("20260918T102030Z")
    expect(url.searchParams.get("response-content-disposition")).toBe(
      'inline; filename="rapport.pdf"'
    )
    expect(url.searchParams.get("response-content-type")).toBe(
      "application/pdf"
    )
  })

  it("signe un dépôt sans paramètre de réponse", async () => {
    const url = new URL(
      await createMailUrlSigner(CONFIG, () => NOW)(
        "PUT",
        "mail/uploads/user_1/uuid/rapport.pdf",
        { ttlSeconds: 600 }
      )
    )

    expect(url.pathname).toBe("/ppt-mail/mail/uploads/user_1/uuid/rapport.pdf")
    expect(url.searchParams.has("response-content-disposition")).toBe(false)
    expect(url.searchParams.get("X-Amz-Signature")).toBeString()
  })

  it("rend une adresse locale sans configuration R2", async () => {
    const url = new URL(
      await createMailUrlSigner(null, () => NOW)(
        "GET",
        "mail/inbound/abc/attachments/0/rapport été.pdf",
        { ttlSeconds: 600, disposition: "attachment" }
      )
    )

    expect(url.origin).toBe("http://localhost")
    expect(url.pathname).toBe(
      "/__mail-storage/mail/inbound/abc/attachments/0/rapport%20%C3%A9t%C3%A9.pdf"
    )
    expect(url.searchParams.get("method")).toBe("GET")
    expect(url.searchParams.get("expires")).toBe(
      String(Math.floor(NOW.getTime() / 1000) + 600)
    )
    expect(url.searchParams.get("response-content-disposition")).toBe(
      "attachment"
    )
    expect(url.searchParams.get("signature")).toBe("local")
  })
})

describe("les clés", () => {
  it("rangent un dépôt sous l'utilisateur qui l'a demandé, avec un nom assaini", () => {
    const key = mailUploadKey("user_1", "../../rapport été.pdf")

    expect(key).toMatch(UPLOAD_KEY_RE)
  })

  it("rangent un sortant sous son fil et son identifiant", () => {
    expect(rawKeyFor("thread_1", "id@pupitre.studio")).toBe(
      "mail/thread_1/id@pupitre.studio/raw.eml"
    )
  })
})
