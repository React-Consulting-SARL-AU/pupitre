import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { joinPlatformOrganization } from "@pupitre/auth/testing"
import { LEGAL_CONTACTS } from "@pupitre/shared/legal"
import { PLATFORM_MAILBOX_IDS } from "@pupitre/shared/platform"
import { ingestInboundEmail } from "../../lib/mail/ingest"
import { bootApiTestServer, resetDb } from "../../testing"
import { createOrganizationWithMembers } from "../../testing/factories"
import {
  resetFakeMail,
  seedPlatformMailboxes,
  useFakeMail,
} from "../../testing/mail"
import { apiRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

interface Session {
  token: string
}

interface MailboxRow {
  id: string
  address: string
  display_name: string
  sensitive: boolean
  can_reply: boolean
  enabled: boolean
  threads: number
  unread: number
}

interface ThreadRow {
  id: string
  address: string
  mailbox_id: string | null
  subject: string
  notes: number
  has_draft: boolean
  automated: boolean
  linked_organization: { id: string; name: string; slug: string } | null
}

interface ThreadDetail extends Omit<ThreadRow, "notes"> {
  mailbox: { id: string; sensitive: boolean } | null
  notes: { id: string; body: string }[]
  activities: { action: string }[]
  draft: { body: string; to: string[] } | null
}

function eml(input: {
  from?: string
  to?: string
  subject?: string
  text?: string
  automated?: boolean
}): ArrayBuffer {
  const lines = [
    `From: ${input.from ?? "Camille <camille@exemple.fr>"}`,
    `To: ${input.to ?? LEGAL_CONTACTS.support}`,
    `Subject: ${input.subject ?? "Mon serveur ne repond plus"}`,
    `Message-ID: <${crypto.randomUUID()}@exemple.fr>`,
  ]

  if (input.automated) {
    lines.push("Auto-Submitted: auto-replied")
  }

  lines.push(
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    input.text ?? "Bonjour, rien ne repond.",
    ""
  )

  return new TextEncoder().encode(lines.join("\r\n")).buffer as ArrayBuffer
}

function ingest(input: Parameters<typeof eml>[0] = {}) {
  return ingestInboundEmail({
    envelopeFrom: input.from ?? "camille@exemple.fr",
    envelopeTo: input.to ?? LEGAL_CONTACTS.support,
    raw: eml(input),
  })
}

describe("/admin/inbox — boîtes, notes, brouillons et lots", () => {
  let mail: ReturnType<typeof useFakeMail>
  let owner: { session: Session; userId: string }
  let member: { session: Session; userId: string }

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
      name: "Jordan Monier",
      role: "platform_admin",
    })
    const memberUser = await createUser({ email: "lecteur@pupitre.studio" })

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
  })

  it("liste les quatre boîtes avec leurs compteurs", async () => {
    await ingest({})

    const response = await apiRequest<{ data: MailboxRow[] }>(
      "/admin/inbox/mailboxes",
      { session: member.session }
    )
    const support = response.json.data.find(
      (mailbox) => mailbox.id === PLATFORM_MAILBOX_IDS.support
    )

    expect(response.status).toBe(200)
    expect(response.json.data).toHaveLength(4)
    expect(support?.address).toBe(LEGAL_CONTACTS.support)
    expect(support?.sensitive).toBe(false)
    expect(support?.threads).toBe(1)
    expect(support?.unread).toBe(1)
    expect(
      response.json.data.find(
        (mailbox) => mailbox.id === PLATFORM_MAILBOX_IDS.security
      )?.sensitive
    ).toBe(true)
  })

  it("ouvre une boîte sur la partie locale et lui rattache les fils déjà reçus", async () => {
    const orphan = await ingest({ to: "jordan@pupitre.studio" })
    const created = await apiRequest<{ data: MailboxRow }>(
      "/admin/inbox/mailboxes",
      {
        body: { address: "jordan", display_name: "Jordan" },
        session: owner.session,
      }
    )
    const thread = await apiRequest<{ data: ThreadDetail }>(
      `/admin/inbox/threads/${orphan.threadId}`,
      { session: owner.session }
    )
    const { prisma } = await bootApiTestServer()
    const event = await prisma.event.findFirst({
      where: { targetType: "mail_mailbox" },
    })

    expect(created.status).toBe(201)
    expect(created.json.data.address).toBe("jordan@pupitre.studio")
    expect(created.json.data.threads).toBe(1)
    expect(thread.json.data.mailbox_id).toBe(created.json.data.id)
    expect(event?.action).toBe("mail.mailbox_created")
  })

  it("refuse une adresse hors du domaine et une adresse déjà prise", async () => {
    const outside = await apiRequest<{ error: { code: string; fix: string } }>(
      "/admin/inbox/mailboxes",
      {
        body: { address: "contact@gmail.com", display_name: "Contact" },
        session: owner.session,
      }
    )
    const taken = await apiRequest<{ error: { code: string } }>(
      "/admin/inbox/mailboxes",
      {
        body: { address: "support", display_name: "Support bis" },
        session: owner.session,
      }
    )

    expect(outside.status).toBe(422)
    expect(outside.json.error.code).toBe("validation")
    expect(taken.status).toBe(409)
    expect(taken.json.error.code).toBe("conflict")
  })

  it("protège les quatre boîtes légales et refuse de supprimer une boîte qui porte un fil", async () => {
    await ingest({})

    const created = await apiRequest<{ data: MailboxRow }>(
      "/admin/inbox/mailboxes",
      {
        body: { address: "ventes", display_name: "Ventes" },
        session: owner.session,
      }
    )
    const legal = await apiRequest<{ error: { code: string } }>(
      `/admin/inbox/mailboxes/${PLATFORM_MAILBOX_IDS.support}`,
      { method: "DELETE", session: owner.session }
    )
    const empty = await apiRequest(
      `/admin/inbox/mailboxes/${created.json.data.id}`,
      { method: "DELETE", session: owner.session }
    )

    expect(legal.status).toBe(409)
    expect(legal.json.error.code).toBe("conflict")
    expect(empty.status).toBe(204)
  })

  it("refuse la suppression d'une boîte encore pleine, et dit de la désactiver", async () => {
    const created = await apiRequest<{ data: MailboxRow }>(
      "/admin/inbox/mailboxes",
      {
        body: { address: "ventes", display_name: "Ventes" },
        session: owner.session,
      }
    )

    await ingest({ to: "ventes@pupitre.studio" })

    const refused = await apiRequest<{ error: { code: string; fix: string } }>(
      `/admin/inbox/mailboxes/${created.json.data.id}`,
      { method: "DELETE", session: owner.session, locale: "fr" }
    )

    expect(refused.status).toBe(409)
    expect(refused.json.error.fix).toContain("Désactivez-la")
  })

  it("ferme la réponse d'une boîte désactivée", async () => {
    const stored = await ingest({})

    await apiRequest(`/admin/inbox/mailboxes/${PLATFORM_MAILBOX_IDS.support}`, {
      method: "PATCH",
      body: { enabled: false },
      session: owner.session,
    })

    const refused = await apiRequest<{ error: { code: string; fix: string } }>(
      `/admin/inbox/threads/${stored.threadId}/reply`,
      { body: { text: "Bonjour" }, session: owner.session }
    )

    expect(refused.status).toBe(409)
    expect(refused.json.error.code).toBe("conflict")
    expect(mail.sent).toHaveLength(0)
  })

  it("refuse de répondre sur un fil qu'aucune boîte ne déclare, et dit laquelle créer", async () => {
    const orphan = await ingest({ to: "jordan@pupitre.studio" })
    const refused = await apiRequest<{ error: { code: string; fix: string } }>(
      `/admin/inbox/threads/${orphan.threadId}/reply`,
      { body: { text: "Bonjour" }, session: owner.session }
    )

    expect(refused.status).toBe(422)
    expect(refused.json.error.fix).toContain("jordan@pupitre.studio")
  })

  it("compte les non-lus par boîte et hors boîte", async () => {
    await ingest({})
    await ingest({ to: "jordan@pupitre.studio", subject: "Hors boîte" })

    const response = await apiRequest<{
      data: {
        mailboxes: { id: string; unread: number; open: number }[]
        others: { unread: number; open: number }
        total_unread: number
      }
    }>("/admin/inbox/counts", { session: member.session })

    expect(response.json.data.total_unread).toBe(2)
    expect(response.json.data.others.unread).toBe(1)
    expect(
      response.json.data.mailboxes.find(
        (mailbox) => mailbox.id === PLATFORM_MAILBOX_IDS.support
      )?.unread
    ).toBe(1)
  })

  it("filtre par boîte, par « autres », et écarte les automatiques par défaut", async () => {
    await ingest({})
    await ingest({ to: "jordan@pupitre.studio", subject: "Hors boîte" })
    await ingest({
      subject: "Rebond",
      from: "mailer-daemon@exemple.fr",
      automated: true,
    })

    const support = await apiRequest<{ data: ThreadRow[]; total: number }>(
      `/admin/inbox/threads?mailbox_id=${PLATFORM_MAILBOX_IDS.support}`,
      { session: owner.session }
    )
    const others = await apiRequest<{ data: ThreadRow[] }>(
      "/admin/inbox/threads?mailbox_id=others",
      { session: owner.session }
    )
    const automated = await apiRequest<{ data: ThreadRow[] }>(
      "/admin/inbox/threads?automated=true",
      { session: owner.session }
    )

    expect(support.json.data).toHaveLength(1)
    expect(others.json.data).toHaveLength(1)
    expect(others.json.data[0].mailbox_id).toBeNull()
    expect(automated.json.data).toHaveLength(1)
    expect(automated.json.data[0].automated).toBe(true)
  })

  it("cherche dans le texte des messages et trie sur l'objet", async () => {
    await ingest({ subject: "Bravo", text: "La sauvegarde a tourné." })
    await ingest({ subject: "Alerte", text: "Rien ne repond." })

    const byText = await apiRequest<{ data: ThreadRow[] }>(
      "/admin/inbox/threads?q=sauvegarde",
      { session: owner.session }
    )
    const sorted = await apiRequest<{ data: ThreadRow[] }>(
      "/admin/inbox/threads?sort=subject&direction=asc",
      { session: owner.session }
    )

    expect(byText.json.data).toHaveLength(1)
    expect(byText.json.data[0].subject).toBe("Bravo")
    expect(sorted.json.data.map((thread) => thread.subject)).toEqual([
      "Alerte",
      "Bravo",
    ])
  })

  it("ferme plusieurs fils d'un coup, et refuse le lot à un membre", async () => {
    const first = await ingest({ subject: "Un" })
    const second = await ingest({ subject: "Deux" })
    const closed = await apiRequest<{ data: { updated: number } }>(
      "/admin/inbox/threads/bulk",
      {
        body: { ids: [first.threadId, second.threadId], status: "closed" },
        session: owner.session,
      }
    )
    const refused = await apiRequest("/admin/inbox/threads/bulk", {
      body: { ids: [first.threadId], status: "open" },
      session: member.session,
    })
    const read = await apiRequest<{ data: { updated: number } }>(
      "/admin/inbox/threads/bulk",
      {
        body: { ids: [first.threadId, second.threadId], unread: false },
        session: member.session,
      }
    )
    const { prisma } = await bootApiTestServer()

    expect(closed.json.data.updated).toBe(2)
    expect(refused.status).toBe(403)
    expect(read.json.data.updated).toBe(2)
    expect(
      await prisma.event.count({ where: { action: "mail.bulk_closed" } })
    ).toBe(1)
    expect(await prisma.mailThread.count({ where: { status: "closed" } })).toBe(
      2
    )
  })

  it("écrit une note interne, la rend avec le fil, et la retire", async () => {
    const stored = await ingest({})
    const created = await apiRequest<{ data: { id: string; body: string } }>(
      `/admin/inbox/threads/${stored.threadId}/notes`,
      { body: { body: "Client du lancement." }, session: owner.session }
    )
    const thread = await apiRequest<{ data: ThreadDetail }>(
      `/admin/inbox/threads/${stored.threadId}`,
      { session: owner.session }
    )
    const list = await apiRequest<{ data: ThreadRow[] }>(
      "/admin/inbox/threads",
      { session: owner.session }
    )
    const removed = await apiRequest(
      `/admin/inbox/threads/${stored.threadId}/notes/${created.json.data.id}`,
      { method: "DELETE", session: owner.session }
    )

    expect(created.status).toBe(201)
    expect(thread.json.data.notes[0].body).toBe("Client du lancement.")
    expect(list.json.data[0].notes).toBe(1)
    expect(removed.status).toBe(204)
  })

  it("refuse à un membre de retirer la note d'un autre", async () => {
    const stored = await ingest({})
    const created = await apiRequest<{ data: { id: string } }>(
      `/admin/inbox/threads/${stored.threadId}/notes`,
      { body: { body: "À suivre." }, session: owner.session }
    )
    const refused = await apiRequest<{ error: { code: string } }>(
      `/admin/inbox/threads/${stored.threadId}/notes/${created.json.data.id}`,
      { method: "DELETE", session: member.session }
    )

    expect(refused.status).toBe(403)
    expect(refused.json.error.code).toBe("forbidden")
  })

  it("garde un brouillon, le remplace, et l'efface à l'envoi", async () => {
    const stored = await ingest({})
    const saved = await apiRequest<{ data: { body: string } }>(
      `/admin/inbox/threads/${stored.threadId}/draft`,
      {
        method: "PUT",
        body: { body: "On regarde", to: ["camille@exemple.fr"] },
        session: owner.session,
      }
    )
    const replaced = await apiRequest<{ data: { body: string } }>(
      `/admin/inbox/threads/${stored.threadId}/draft`,
      {
        method: "PUT",
        body: { body: "On a regardé" },
        session: owner.session,
      }
    )
    const withDraft = await apiRequest<{ data: ThreadRow[] }>(
      "/admin/inbox/threads",
      { session: owner.session }
    )

    await apiRequest(`/admin/inbox/threads/${stored.threadId}/reply`, {
      body: { text: "Bonjour, on regarde." },
      session: owner.session,
    })

    const gone = await apiRequest(
      `/admin/inbox/threads/${stored.threadId}/draft`,
      { session: owner.session }
    )

    expect(saved.json.data.body).toBe("On regarde")
    expect(replaced.json.data.body).toBe("On a regardé")
    expect(withDraft.json.data[0].has_draft).toBe(true)
    expect(gone.status).toBe(404)
  })

  it("lie un fil à une organisation, la rend, et refuse une organisation inconnue", async () => {
    const stored = await ingest({})
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
    })
    const linked = await apiRequest<{ data: ThreadDetail }>(
      `/admin/inbox/threads/${stored.threadId}`,
      {
        method: "PATCH",
        body: { linked_organization_id: organization.id },
        session: owner.session,
      }
    )
    const filtered = await apiRequest<{ data: ThreadRow[] }>(
      `/admin/inbox/threads?organization_id=${organization.id}`,
      { session: owner.session }
    )
    const refused = await apiRequest<{ error: { code: string } }>(
      `/admin/inbox/threads/${stored.threadId}`,
      {
        method: "PATCH",
        body: { linked_organization_id: "org_inconnue" },
        session: owner.session,
      }
    )
    const { prisma } = await bootApiTestServer()

    expect(linked.json.data.linked_organization?.name).toBe("Atelier")
    expect(filtered.json.data).toHaveLength(1)
    expect(refused.status).toBe(422)
    expect(await prisma.event.count({ where: { action: "mail.linked" } })).toBe(
      1
    )
  })

  it("journalise la lecture d'une boîte sensible, et seulement celle-là", async () => {
    const sensitive = await ingest({
      to: LEGAL_CONTACTS.security,
      subject: "Faille",
    })
    const ordinary = await ingest({})

    await apiRequest(`/admin/inbox/threads/${sensitive.threadId}`, {
      session: owner.session,
    })
    await apiRequest(`/admin/inbox/threads/${ordinary.threadId}`, {
      session: owner.session,
    })

    const { prisma } = await bootApiTestServer()
    const reads = await prisma.event.findMany({
      where: { action: "mail.read" },
    })

    expect(reads).toHaveLength(1)
    expect(reads[0].targetId).toBe(sensitive.threadId)
  })

  it("journalise la lecture d'une pièce jointe sensible", async () => {
    const stored = await ingestInboundEmail({
      envelopeFrom: "chercheuse@exemple.org",
      envelopeTo: LEGAL_CONTACTS.security,
      raw: new TextEncoder().encode(
        [
          "From: Chercheuse <chercheuse@exemple.org>",
          `To: ${LEGAL_CONTACTS.security}`,
          "Subject: Faille",
          `Message-ID: <${crypto.randomUUID()}@exemple.org>`,
          "MIME-Version: 1.0",
          'Content-Type: multipart/mixed; boundary="mix"',
          "",
          "--mix",
          "Content-Type: text/plain; charset=UTF-8",
          "",
          "Voir le rapport.",
          "",
          "--mix",
          'Content-Type: text/plain; name="rapport.txt"',
          'Content-Disposition: attachment; filename="rapport.txt"',
          "Content-Transfer-Encoding: base64",
          "",
          btoa("preuve"),
          "",
          "--mix--",
          "",
        ].join("\r\n")
      ).buffer as ArrayBuffer,
    })
    const thread = await apiRequest<{
      data: { messages: { attachments: { id: string }[] }[] }
    }>(`/admin/inbox/threads/${stored.threadId}`, { session: owner.session })

    await apiRequest(
      `/admin/inbox/attachments/${thread.json.data.messages[0].attachments[0].id}/url`,
      { session: owner.session }
    )

    const { prisma } = await bootApiTestServer()

    expect(
      await prisma.event.count({ where: { action: "mail.attachment_read" } })
    ).toBe(1)
  })

  it("écrit une réponse type, la modifie et la retire", async () => {
    const created = await apiRequest<{ data: { id: string; name: string } }>(
      "/admin/inbox/templates",
      {
        body: {
          name: "Accusé de réception",
          body: "Bonjour, nous avons bien reçu votre message.",
          mailbox_id: PLATFORM_MAILBOX_IDS.support,
        },
        session: owner.session,
      }
    )
    const listed = await apiRequest<{ data: { id: string }[] }>(
      `/admin/inbox/templates?mailbox_id=${PLATFORM_MAILBOX_IDS.support}`,
      { session: member.session }
    )
    const patched = await apiRequest<{ data: { name: string } }>(
      `/admin/inbox/templates/${created.json.data.id}`,
      {
        method: "PATCH",
        body: { name: "Accusé" },
        session: owner.session,
      }
    )
    const removed = await apiRequest(
      `/admin/inbox/templates/${created.json.data.id}`,
      { method: "DELETE", session: owner.session }
    )

    expect(created.status).toBe(201)
    expect(listed.json.data).toHaveLength(1)
    expect(patched.json.data.name).toBe("Accusé")
    expect(removed.status).toBe(204)
  })

  it("diffuse un événement à la réception, à la fermeture et à l'envoi", async () => {
    const stored = await ingest({})

    await apiRequest(`/admin/inbox/threads/${stored.threadId}`, {
      method: "PATCH",
      body: { status: "closed" },
      session: owner.session,
    })
    await apiRequest(`/admin/inbox/threads/${stored.threadId}/reply`, {
      body: { text: "Bonjour, on regarde." },
      session: owner.session,
    })

    expect(mail.broadcast.map((event) => event.type)).toEqual([
      "thread.received",
      "thread.updated",
      "message.sent",
    ])
  })
})
