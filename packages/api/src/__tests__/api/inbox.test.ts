import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { joinPlatformOrganization } from "@pupitre/auth/testing"
import { LEGAL_CONTACTS } from "@pupitre/shared/legal"
import { PLATFORM_MAILBOX_IDS } from "@pupitre/shared/platform"
import { ingestInboundEmail } from "../../lib/mail/ingest"
import { configureMailStorage } from "../../lib/mail/storage"
import { bootApiTestServer, resetDb } from "../../testing"
import {
  resetFakeMail,
  seedPlatformMailboxes,
  useFailingMailTransport,
  useFakeMail,
} from "../../testing/mail"
import { apiRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

interface Session {
  token: string
}

interface ThreadRow {
  id: string
  address: string
  subject: string
  status: string
  unread: boolean
  from: { email: string; name: string | null }
  sender_authenticated: boolean
  snippet: string | null
  messages: number
  assigned_user: { id: string } | null
  contact: { user_id: string } | null
}

interface MessageRow {
  id: string
  direction: string
  to: string[]
  cc: string[]
  subject: string | null
  has_html: boolean
  authenticated: boolean
  delivery: string
  sent_by: { id: string; name: string } | null
  attachments: { id: string; filename: string; size: number }[]
}

const PNG_BYTES = "iVBORw0KGgo="

const IMG_SRC_RE = /<img src="([^"]+)">/

const LOGO_KEY_RE = /\/attachments\/1\/logo\.png$/

const JOURNAL_KEY_RE = /\/attachments\/0\/journal\.txt$/

function eml(input: {
  from?: string
  to?: string
  cc?: string
  subject?: string
  messageId?: string
  attachmentType?: string
  inlineImage?: boolean
}): ArrayBuffer {
  const lines = [
    `From: ${input.from ?? "Camille <camille@exemple.fr>"}`,
    `To: ${input.to ?? "support@pupitre.studio"}`,
  ]

  if (input.cc) {
    lines.push(`Cc: ${input.cc}`)
  }

  lines.push(
    `Subject: ${input.subject ?? "Mon serveur ne repond plus"}`,
    `Message-ID: <${input.messageId ?? crypto.randomUUID()}@exemple.fr>`,
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="mix"',
    "",
    "--mix",
    "Content-Type: text/html; charset=UTF-8",
    "",
    input.inlineImage
      ? '<p>Bonjour</p><img src="cid:logo@exemple.fr">'
      : "<p>Bonjour</p><script>alert(1)</script>",
    "",
    "--mix",
    `Content-Type: ${input.attachmentType ?? "text/plain"}; name="journal.txt"`,
    'Content-Disposition: attachment; filename="journal.txt"',
    "Content-Transfer-Encoding: base64",
    "",
    btoa("erreur 502"),
    ""
  )

  if (input.inlineImage) {
    lines.push(
      "--mix",
      'Content-Type: image/png; name="logo.png"',
      "Content-ID: <logo@exemple.fr>",
      'Content-Disposition: inline; filename="logo.png"',
      "Content-Transfer-Encoding: base64",
      "",
      PNG_BYTES,
      ""
    )
  }

  lines.push("--mix--", "")

  return new TextEncoder().encode(lines.join("\r\n")).buffer as ArrayBuffer
}

function upload(
  mail: ReturnType<typeof useFakeMail>,
  userId: string,
  filename: string,
  content: string,
  mimeType = "application/pdf"
) {
  const key = `mail/uploads/${userId}/${crypto.randomUUID()}/${filename}`

  mail.objects.set(key, {
    body: new TextEncoder().encode(content).buffer as ArrayBuffer,
    contentType: mimeType,
  })

  return { key, filename, mime_type: mimeType, size: content.length }
}

function ingest(input: Parameters<typeof eml>[0] = {}) {
  return ingestInboundEmail({
    envelopeFrom: "camille@exemple.fr",
    envelopeTo: input.to ?? "support@pupitre.studio",
    raw: eml(input),
  })
}

describe("/admin/inbox", () => {
  let mail: ReturnType<typeof useFakeMail>
  let owner: { session: Session; userId: string }
  let member: { session: Session; userId: string }
  let outsider: Session

  beforeAll(async () => {
    await bootApiTestServer()
  })

  afterAll(() => {
    resetFakeMail()
  })

  beforeEach(async () => {
    await resetDb()
    mail = useFakeMail()
    await seedPlatformMailboxes()

    const ownerUser = await createUser({
      email: "jordan@pupitre.studio",
      role: "platform_admin",
    })
    const memberUser = await createUser({ email: "lecteur@pupitre.studio" })
    const otherUser = await createUser({ email: "dehors@exemple.fr" })

    await joinPlatformOrganization(
      (await bootApiTestServer()).prisma,
      memberUser.user.id,
      "member"
    )

    owner = {
      session: await createSession({ userId: ownerUser.user.id }),
      userId: ownerUser.user.id,
    }
    member = {
      session: await createSession({ userId: memberUser.user.id }),
      userId: memberUser.user.id,
    }
    outsider = await createSession({ userId: otherUser.user.id })
  })

  it("lists the threads with their sender and the unread counter", async () => {
    await ingest({ subject: "Mon serveur ne repond plus" })

    const response = await apiRequest<{
      data: ThreadRow[]
      total: number
      unread: number
    }>("/admin/inbox/threads", { session: owner.session })

    expect(response.status).toBe(200)
    expect(response.json.total).toBe(1)
    expect(response.json.unread).toBe(1)
    expect(response.json.data[0].address).toBe("support@pupitre.studio")
    expect(response.json.data[0].from.email).toBe("camille@exemple.fr")
    expect(response.json.data[0].messages).toBe(1)
  })

  it("states of a thread and its message that the sender has not been verified", async () => {
    const stored = await ingest({})
    const list = await apiRequest<{ data: ThreadRow[] }>(
      "/admin/inbox/threads",
      { session: owner.session }
    )
    const detail = await apiRequest<{
      data: ThreadRow & { messages: MessageRow[] }
    }>(`/admin/inbox/threads/${stored.threadId}`, { session: owner.session })

    expect(list.json.data[0].sender_authenticated).toBe(false)
    expect(detail.json.data.sender_authenticated).toBe(false)
    expect(detail.json.data.messages[0].authenticated).toBe(false)
  })

  it("filters by status, address and search", async () => {
    await ingest({ subject: "Facture" })
    await ingest({
      subject: "Fuite",
      to: "security@pupitre.studio",
      from: "Chercheuse <chercheuse@exemple.org>",
    })

    const byAddress = await apiRequest<{ data: ThreadRow[] }>(
      "/admin/inbox/threads?address=security@pupitre.studio",
      { session: owner.session }
    )
    const byQuery = await apiRequest<{ data: ThreadRow[] }>(
      "/admin/inbox/threads?q=chercheuse",
      { session: owner.session }
    )

    expect(byAddress.json.data).toHaveLength(1)
    expect(byAddress.json.data[0].subject).toBe("Fuite")
    expect(byQuery.json.data).toHaveLength(1)
    expect(byQuery.json.data[0].from.email).toBe("chercheuse@exemple.org")
  })

  it("opens a thread without marking it read", async () => {
    const stored = await ingest({})
    const response = await apiRequest<{
      data: ThreadRow & { messages: MessageRow[] }
    }>(`/admin/inbox/threads/${stored.threadId}`, { session: member.session })

    expect(response.status).toBe(200)
    expect(response.json.data.unread).toBe(true)
    expect(response.json.data.messages).toHaveLength(1)
    expect(response.json.data.messages[0].direction).toBe("inbound")
    expect(response.json.data.messages[0].has_html).toBe(true)
    expect(response.json.data.messages[0].attachments[0].filename).toBe(
      "journal.txt"
    )
  })

  it("returns 404 on an unknown thread", async () => {
    const response = await apiRequest("/admin/inbox/threads/inconnu", {
      session: owner.session,
    })

    expect(response.status).toBe(404)
  })

  it("serves the HTML as is, under a CSP that forbids any script", async () => {
    const stored = await ingest({})
    const thread = await apiRequest<{
      data: { messages: MessageRow[] }
    }>(`/admin/inbox/threads/${stored.threadId}`, { session: owner.session })
    const response = await apiRequest<string>(
      `/admin/inbox/messages/${thread.json.data.messages[0].id}/html`,
      { session: owner.session }
    )

    expect(response.status).toBe(200)
    expect(response.raw.headers.get("content-security-policy")).toContain(
      "default-src 'none'"
    )
    expect(response.raw.headers.get("content-type")).toContain("text/html")
    expect(response.raw.headers.get("x-content-type-options")).toBe("nosniff")
    expect(response.json).toContain("<p>Bonjour</p>")
  })

  it("rewrites an inline image to its signed address, so it passes the CSP", async () => {
    const stored = await ingest({ inlineImage: true })
    const thread = await apiRequest<{
      data: { messages: MessageRow[] }
    }>(`/admin/inbox/threads/${stored.threadId}`, { session: owner.session })
    const response = await apiRequest<string>(
      `/admin/inbox/messages/${thread.json.data.messages[0].id}/html`,
      { session: owner.session }
    )
    const src = response.json.match(IMG_SRC_RE)?.[1] ?? ""
    const url = new URL(src.replace(/&amp;/g, "&"))

    expect(response.status).toBe(200)
    expect(response.json).not.toContain("cid:")
    expect(url.hostname).toBe("acc123.r2.cloudflarestorage.com")
    expect(url.pathname).toMatch(LOGO_KEY_RE)
    expect(url.searchParams.get("response-content-disposition")).toBe(
      'inline; filename="logo.png"'
    )
    expect(url.searchParams.get("response-content-type")).toBe("image/png")
    expect(mail.signed.map((request) => request.method)).toEqual(["GET"])
  })

  it("signs the address of an attachment to save, under its name", async () => {
    const stored = await ingest({})
    const thread = await apiRequest<{
      data: { messages: MessageRow[] }
    }>(`/admin/inbox/threads/${stored.threadId}`, { session: owner.session })
    const attachment = thread.json.data.messages[0].attachments[0]
    const response = await apiRequest<{
      data: {
        url: string
        expires_at: string
        mime_type: string
        filename: string
        size: number
      }
    }>(`/admin/inbox/attachments/${attachment.id}/url`, {
      session: member.session,
    })
    const url = new URL(response.json.data.url)

    expect(response.status).toBe(200)
    expect(response.json.data.filename).toBe("journal.txt")
    expect(response.json.data.mime_type).toBe("text/plain")
    expect(response.json.data.size).toBe("erreur 502".length)
    expect(new Date(response.json.data.expires_at).getTime()).toBeGreaterThan(
      Date.now() + 500_000
    )
    expect(url.hostname).toBe("acc123.r2.cloudflarestorage.com")
    expect(url.pathname).toMatch(JOURNAL_KEY_RE)
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600")
    expect(url.searchParams.get("response-content-disposition")).toBe(
      'attachment; filename="journal.txt"'
    )
    expect(url.searchParams.get("response-content-type")).toBe("text/plain")
  })

  it("opens inline only an image or a PDF, and forces the rest to be saved", async () => {
    const image = await ingest({ attachmentType: "image/png" })
    const svg = await ingest({
      attachmentType: "image/svg+xml",
      subject: "SVG",
    })
    const attachmentOf = async (threadId: string) =>
      (
        await apiRequest<{ data: { messages: MessageRow[] } }>(
          `/admin/inbox/threads/${threadId}`,
          { session: owner.session }
        )
      ).json.data.messages[0].attachments[0]
    const inlineImage = await apiRequest<{
      data: { url: string; mime_type: string }
    }>(
      `/admin/inbox/attachments/${(await attachmentOf(image.threadId)).id}/url?disposition=inline`,
      { session: owner.session }
    )
    const inlineSvg = await apiRequest<{
      data: { url: string; mime_type: string }
    }>(
      `/admin/inbox/attachments/${(await attachmentOf(svg.threadId)).id}/url?disposition=inline`,
      { session: owner.session }
    )

    expect(
      new URL(inlineImage.json.data.url).searchParams.get(
        "response-content-disposition"
      )
    ).toBe('inline; filename="journal.txt"')
    expect(inlineImage.json.data.mime_type).toBe("image/png")
    expect(
      new URL(inlineSvg.json.data.url).searchParams.get(
        "response-content-disposition"
      )
    ).toBe('attachment; filename="journal.txt"')
    expect(inlineSvg.json.data.mime_type).toBe("application/octet-stream")
  })

  it("returns 404 on an unknown attachment", async () => {
    const response = await apiRequest<{ error: { code: string } }>(
      "/admin/inbox/attachments/inconnue/url",
      { session: owner.session }
    )

    expect(response.status).toBe(404)
    expect(response.json.error.code).toBe("not_found")
  })

  it("lets a member mark the thread read", async () => {
    const stored = await ingest({})
    const response = await apiRequest<{ data: ThreadRow }>(
      `/admin/inbox/threads/${stored.threadId}`,
      { method: "PATCH", body: { unread: false }, session: member.session }
    )

    expect(response.status).toBe(200)
    expect(response.json.data.unread).toBe(false)
  })

  it("refuses a member closing a thread", async () => {
    const stored = await ingest({})
    const response = await apiRequest<{ error: { code: string } }>(
      `/admin/inbox/threads/${stored.threadId}`,
      { method: "PATCH", body: { status: "closed" }, session: member.session }
    )

    expect(response.status).toBe(403)
    expect(response.json.error.code).toBe("forbidden")
  })

  it("closes a thread and logs the action", async () => {
    const stored = await ingest({})
    const response = await apiRequest<{ data: ThreadRow }>(
      `/admin/inbox/threads/${stored.threadId}`,
      { method: "PATCH", body: { status: "closed" }, session: owner.session }
    )
    const { prisma } = await bootApiTestServer()
    const event = await prisma.event.findFirst({
      where: { targetType: "mail_thread", targetId: stored.threadId },
    })

    expect(response.json.data.status).toBe("closed")
    expect(event?.action).toBe("mail.closed")
  })

  it("assigns a thread to a team member and refuses an outsider", async () => {
    const stored = await ingest({})
    const assigned = await apiRequest<{ data: ThreadRow }>(
      `/admin/inbox/threads/${stored.threadId}`,
      {
        method: "PATCH",
        body: { assigned_user_id: member.userId },
        session: owner.session,
      }
    )
    const refused = await apiRequest<{ error: { code: string } }>(
      `/admin/inbox/threads/${stored.threadId}`,
      {
        method: "PATCH",
        body: { assigned_user_id: "personne" },
        session: owner.session,
      }
    )

    expect(assigned.json.data.assigned_user?.id).toBe(member.userId)
    expect(refused.status).toBe(422)
    expect(refused.json.error.code).toBe("validation")
  })

  it("replies with the right headers and records the outgoing message", async () => {
    const stored = await ingest({
      cc: "Equipe <equipe@exemple.fr>, legal@pupitre.studio",
      messageId: "racine",
    })
    const response = await apiRequest<{ data: MessageRow }>(
      `/admin/inbox/threads/${stored.threadId}/reply`,
      {
        body: { text: "Bonjour, on regarde." },
        session: owner.session,
      }
    )

    expect(response.status).toBe(201)
    expect(response.json.data.direction).toBe("outbound")
    expect(response.json.data.delivery).toBe("sent")
    expect(response.json.data.subject).toBe("Re: Mon serveur ne repond plus")
    expect(response.json.data.to).toEqual(["camille@exemple.fr"])
    expect(response.json.data.cc).toEqual(["equipe@exemple.fr"])
    expect(response.json.data.sent_by?.id).toBe(owner.userId)

    expect(mail.sent).toHaveLength(1)
    expect(mail.sent[0].from).toBe(LEGAL_CONTACTS.support)
    expect(mail.sent[0].raw).toContain("In-Reply-To: <racine@exemple.fr>")
    expect(mail.sent[0].raw).toContain("References: <racine@exemple.fr>")
    expect(mail.sent[0].raw).toContain("Cc: equipe@exemple.fr")
  })

  it("signs an upload address under the user, for ten minutes", async () => {
    const response = await apiRequest<{
      data: { key: string; url: string; expires_at: string }
    }>("/admin/inbox/uploads", {
      body: {
        filename: "rapport.pdf",
        mime_type: "application/pdf",
        size: 1200,
      },
      session: owner.session,
    })
    const url = new URL(response.json.data.url)

    expect(response.status).toBe(201)
    expect(response.json.data.key).toMatch(
      new RegExp(`^mail/uploads/${owner.userId}/[0-9a-f-]{36}/rapport\\.pdf$`)
    )
    expect(url.pathname).toBe(`/ppt-mail/${response.json.data.key}`)
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600")
    expect(mail.signed).toEqual([
      { method: "PUT", key: response.json.data.key, ttlSeconds: 600 },
    ])
  })

  it("refuses an executable upload, one that is too big, or one from a member without a role", async () => {
    const blocked = await apiRequest<{
      error: { code: string; message: string }
    }>("/admin/inbox/uploads", {
      body: {
        filename: "setup.exe",
        mime_type: "application/octet-stream",
        size: 10,
      },
      session: owner.session,
      locale: "en",
    })
    const tooLarge = await apiRequest<{ error: { code: string } }>(
      "/admin/inbox/uploads",
      {
        body: {
          filename: "video.mp4",
          mime_type: "video/mp4",
          size: 5 * 1024 * 1024 + 1,
        },
        session: owner.session,
      }
    )
    const refused = await apiRequest("/admin/inbox/uploads", {
      body: { filename: "a.pdf", mime_type: "application/pdf", size: 10 },
      session: member.session,
    })

    expect(blocked.status).toBe(422)
    expect(blocked.json.error.code).toBe("validation")
    expect(blocked.json.error.message).toContain("setup.exe")
    expect(tooLarge.status).toBe(422)
    expect(refused.status).toBe(403)
    expect(mail.signed).toHaveLength(0)
  })

  it("replies with attachments: mixed MIME, stored under the message, uploads erased", async () => {
    const stored = await ingest({})
    const pdf = upload(mail, owner.userId, "rapport.pdf", "%PDF-1.7")
    const notes = upload(mail, owner.userId, "notes.txt", "ok", "text/plain")
    const response = await apiRequest<{ data: MessageRow }>(
      `/admin/inbox/threads/${stored.threadId}/reply`,
      {
        body: { text: "Voici le rapport.", attachments: [pdf, notes] },
        session: owner.session,
      }
    )
    const filed = [...mail.objects.keys()].filter((key) =>
      key.startsWith(`mail/${stored.threadId}/`)
    )

    expect(response.status).toBe(201)
    expect(response.json.data.attachments.map((a) => a.filename)).toEqual([
      "rapport.pdf",
      "notes.txt",
    ])
    expect(mail.sent[0].raw).toContain("multipart/mixed")
    expect(mail.sent[0].raw).toContain('filename="rapport.pdf"')
    expect(mail.sent[0].raw).toContain(btoa("%PDF-1.7"))
    expect(
      filed.some((key) => key.endsWith("/attachments/0/rapport.pdf"))
    ).toBe(true)
    expect(filed.some((key) => key.endsWith("/attachments/1/notes.txt"))).toBe(
      true
    )
    expect(mail.objects.has(pdf.key)).toBe(false)
    expect(mail.objects.has(notes.key)).toBe(false)
  })

  it("refuses an attachment missing from the bucket, from another user, or too heavy in total", async () => {
    const stored = await ingest({})
    const foreign = upload(mail, member.userId, "autre.pdf", "%PDF")
    const missing = {
      key: `mail/uploads/${owner.userId}/${crypto.randomUUID()}/perdu.pdf`,
      filename: "perdu.pdf",
      mime_type: "application/pdf",
      size: 4,
    }
    const heavy = upload(mail, owner.userId, "lourd.pdf", "%PDF")
    const reply = (attachments: unknown[], locale: "fr" | "en" = "fr") =>
      apiRequest<{ error: { code: string; message: string; fix: string } }>(
        `/admin/inbox/threads/${stored.threadId}/reply`,
        {
          body: { text: "Bonjour", attachments },
          session: owner.session,
          locale,
        }
      )
    const foreignResponse = await reply([foreign])
    const missingResponse = await reply([missing], "en")
    const heavyResponse = await reply([
      { ...heavy, size: 5 * 1024 * 1024 },
      { ...heavy, size: 1 },
    ])

    expect(foreignResponse.status).toBe(422)
    expect(foreignResponse.json.error.code).toBe("validation")
    expect(foreignResponse.json.error.message).toContain("autre.pdf")
    expect(missingResponse.status).toBe(422)
    expect(missingResponse.json.error.message).toBe(
      'The file "perdu.pdf" never reached the bucket.'
    )
    expect(missingResponse.json.error.fix).toContain("Upload it again")
    expect(heavyResponse.status).toBe(422)
    expect(heavyResponse.json.error.message).toContain("5 Mio")
    expect(mail.sent).toHaveLength(0)
    expect(mail.objects.has(foreign.key)).toBe(true)
  })

  it("refuses more than ten attachments at validation", async () => {
    const stored = await ingest({})
    const response = await apiRequest(
      `/admin/inbox/threads/${stored.threadId}/reply`,
      {
        body: {
          text: "Bonjour",
          attachments: Array.from({ length: 11 }, () =>
            upload(mail, owner.userId, "a.pdf", "%PDF")
          ),
        },
        session: owner.session,
      }
    )

    expect(response.status).toBe(422)
    expect(mail.sent).toHaveLength(0)
  })

  it("marks the thread read and dated after a reply", async () => {
    const stored = await ingest({})

    await apiRequest(`/admin/inbox/threads/${stored.threadId}/reply`, {
      body: { text: "Bonjour" },
      session: owner.session,
    })

    const thread = await apiRequest<{
      data: ThreadRow & { messages: MessageRow[] }
    }>(`/admin/inbox/threads/${stored.threadId}`, { session: owner.session })

    expect(thread.json.data.unread).toBe(false)
    expect(thread.json.data.messages).toHaveLength(2)
  })

  it("refuses the reply of a member without a role", async () => {
    const stored = await ingest({})
    const response = await apiRequest(
      `/admin/inbox/threads/${stored.threadId}/reply`,
      { body: { text: "Bonjour" }, session: member.session }
    )

    expect(response.status).toBe(403)
    expect(mail.sent).toHaveLength(0)
  })

  it("keeps the message as failed and answers 502 when sending breaks", async () => {
    const stored = await ingest({})

    useFailingMailTransport(new Error("binding absent"))

    const response = await apiRequest<{
      error: { code: string; message: string }
    }>(`/admin/inbox/threads/${stored.threadId}/reply`, {
      body: { text: "Bonjour" },
      session: owner.session,
    })
    const { prisma } = await bootApiTestServer()
    const failed = await prisma.mailMessage.findFirst({
      where: { threadId: stored.threadId, direction: "outbound" },
    })

    expect(response.status).toBe(502)
    expect(response.json.error.message).not.toContain("binding absent")
    expect(failed?.delivery).toBe("failed")
    expect(failed?.error).toContain("binding absent")
  })

  it("does not write a new message to our own addresses only, and opens no thread", async () => {
    const response = await apiRequest<{ error: { code: string } }>(
      "/admin/inbox/compose",
      {
        body: {
          mailbox_id: PLATFORM_MAILBOX_IDS.legal,
          to: ["support@pupitre.studio"],
          subject: "Boucle",
          text: "Bonjour",
        },
        session: owner.session,
      }
    )
    const { prisma } = await bootApiTestServer()

    expect(response.status).toBe(409)
    expect(response.json.error.code).toBe("conflict")
    expect(mail.sent).toHaveLength(0)
    expect(await prisma.mailThread.count()).toBe(0)
  })

  it("opens no thread when the bucket refuses the message to write", async () => {
    configureMailStorage({
      ...mail.storage,
      put: () => Promise.reject(new Error("seau injoignable")),
    })

    const response = await apiRequest("/admin/inbox/compose", {
      body: {
        mailbox_id: PLATFORM_MAILBOX_IDS.legal,
        to: ["client@exemple.fr"],
        subject: "Conditions",
        text: "Bonjour",
      },
      session: owner.session,
    })
    const { prisma } = await bootApiTestServer()

    expect(response.status).toBe(500)
    expect(mail.sent).toHaveLength(0)
    expect(await prisma.mailThread.count()).toBe(0)
  })

  it("refuses an attachment type that is not one", async () => {
    const response = await apiRequest("/admin/inbox/uploads", {
      body: {
        filename: "a.pdf",
        mime_type: "application/pdf\r\nBcc: attaquant@exemple.fr",
        size: 10,
      },
      session: owner.session,
    })

    expect(response.status).toBe(422)
  })

  it("writes a new message from a verified address", async () => {
    const response = await apiRequest<{
      data: ThreadRow & { messages: MessageRow[] }
    }>("/admin/inbox/compose", {
      body: {
        mailbox_id: PLATFORM_MAILBOX_IDS.legal,
        to: ["client@exemple.fr"],
        subject: "Mise à jour des conditions",
        text: "Bonjour, voici la nouvelle version.",
      },
      session: owner.session,
    })

    expect(response.status).toBe(201)
    expect(response.json.data.address).toBe(LEGAL_CONTACTS.legal)
    expect(response.json.data.unread).toBe(false)
    expect(response.json.data.messages[0].direction).toBe("outbound")
    expect(response.json.data.from.email).toBe("client@exemple.fr")
    expect(response.json.data.sender_authenticated).toBe(true)
    expect(response.json.data.snippet).toContain("Bonjour")
    expect(mail.sent[0].to).toEqual(["client@exemple.fr"])
  })

  it("writes a new message with an attachment, and opens no thread if it is missing", async () => {
    const pdf = upload(mail, owner.userId, "conditions.pdf", "%PDF")
    const response = await apiRequest<{
      data: ThreadRow & { messages: MessageRow[] }
    }>("/admin/inbox/compose", {
      body: {
        mailbox_id: PLATFORM_MAILBOX_IDS.legal,
        to: ["client@exemple.fr"],
        subject: "Conditions",
        text: "Ci-joint.",
        attachments: [pdf],
      },
      session: owner.session,
    })
    const missing = await apiRequest<{ error: { code: string } }>(
      "/admin/inbox/compose",
      {
        body: {
          mailbox_id: PLATFORM_MAILBOX_IDS.legal,
          to: ["client@exemple.fr"],
          subject: "Sans fichier",
          text: "Ci-joint.",
          attachments: [
            { ...pdf, key: `mail/uploads/${owner.userId}/x/y.pdf` },
          ],
        },
        session: owner.session,
      }
    )
    const { prisma } = await bootApiTestServer()

    expect(response.status).toBe(201)
    expect(response.json.data.messages[0].attachments[0].filename).toBe(
      "conditions.pdf"
    )
    expect(mail.sent[0].raw).toContain('filename="conditions.pdf"')
    expect(missing.status).toBe(422)
    expect(await prisma.mailThread.count()).toBe(1)
  })

  it("refuses to write from a mailbox that does not exist", async () => {
    const response = await apiRequest<{ error: { code: string } }>(
      "/admin/inbox/compose",
      {
        body: {
          mailbox_id: "mbx_inconnue",
          to: ["client@exemple.fr"],
          subject: "Bonjour",
          text: "Bonjour",
        },
        session: owner.session,
      }
    )

    expect(response.status).toBe(422)
    expect(response.json.error.code).toBe("validation")
  })

  it("refuses everything to anyone not on the team", async () => {
    const anonymous = await apiRequest("/admin/inbox/threads")
    const stranger = await apiRequest("/admin/inbox/threads", {
      session: outsider,
    })

    expect(anonymous.status).toBe(401)
    expect(stranger.status).toBe(403)
  })
})
