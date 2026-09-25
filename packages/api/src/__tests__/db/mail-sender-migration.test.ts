import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type Client, createClient } from "@libsql/client"

const MIGRATIONS_DIR = join(import.meta.dir, "../../../../db/migrations")

const MIGRATION_FILE_RE = /^\d{4}_.*\.sql$/

const MAIL_SENDER = "0017_mail_sender_authentication.sql"

function migrationsBefore(last: string): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => MIGRATION_FILE_RE.test(file) && file < last)
    .sort()
    .map((file) => readFileSync(join(MIGRATIONS_DIR, file), "utf8"))
}

interface SeededMessage {
  id: string
  threadId: string
  direction: "inbound" | "outbound"
  fromEmail: string
  fromName?: string
  to: string[]
  snippet: string
  messageId: string
  createdAt: string
}

async function seedThread(
  client: Client,
  id: string,
  address: string,
  subject = "Objet"
): Promise<void> {
  await client.execute({
    sql: 'INSERT INTO "MailThread" ("id", "address", "subject", "normalizedSubject", "updatedAt") VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
    args: [id, address, subject, subject.toLowerCase()],
  })
}

async function seedMessage(
  client: Client,
  message: SeededMessage
): Promise<void> {
  await client.execute({
    sql: 'INSERT INTO "MailMessage" ("id", "threadId", "direction", "fromEmail", "fromName", "toEmails", "ccEmails", "snippet", "messageId", "createdAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    args: [
      message.id,
      message.threadId,
      message.direction,
      message.fromEmail,
      message.fromName ?? null,
      JSON.stringify(message.to),
      "[]",
      message.snippet,
      message.messageId,
      message.createdAt,
    ],
  })
}

describe("la migration 0017 sur une base déjà remplie", () => {
  let dir: string
  let client: Client

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "pupitre-mail-sender-"))
    client = createClient({ url: `file:${join(dir, "test.sqlite")}` })

    for (const sql of migrationsBefore(MAIL_SENDER)) {
      await client.executeMultiple(sql)
    }

    await seedThread(client, "thr_repondu", "support@pupitre.studio")
    await seedMessage(client, {
      id: "msg_entrant",
      threadId: "thr_repondu",
      direction: "inbound",
      fromEmail: "camille@exemple.fr",
      fromName: "Camille",
      to: ["support@pupitre.studio"],
      snippet: "Bonjour",
      messageId: "entrant@exemple.fr",
      createdAt: "2026-01-01T10:00:00.000Z",
    })
    await seedMessage(client, {
      id: "msg_reponse",
      threadId: "thr_repondu",
      direction: "outbound",
      fromEmail: "support@pupitre.studio",
      to: ["camille@exemple.fr"],
      snippet: "Voici la réponse",
      messageId: "reponse@pupitre.studio",
      createdAt: "2026-01-01T11:00:00.000Z",
    })
    await seedThread(client, "thr_ecrit", "legal@pupitre.studio")
    await seedMessage(client, {
      id: "msg_ecrit",
      threadId: "thr_ecrit",
      direction: "outbound",
      fromEmail: "legal@pupitre.studio",
      to: ["alex@exemple.fr"],
      snippet: "Mise en demeure",
      messageId: "ecrit@pupitre.studio",
      createdAt: "2026-01-02T10:00:00.000Z",
    })
    await seedThread(
      client,
      "thr_sans_objet",
      "support@pupitre.studio",
      "(sans objet)"
    )
    await client.executeMultiple(
      readFileSync(join(MIGRATIONS_DIR, MAIL_SENDER), "utf8")
    )
  })

  afterAll(() => {
    client.close()
    rmSync(dir, { force: true, recursive: true })
  })

  it("range chaque message sous l'adresse de son fil, et tient pour vérifié ce que nous avons envoyé", async () => {
    const rows = await client.execute(
      'SELECT "id", "address", "authenticated" FROM "MailMessage" ORDER BY "id"'
    )

    expect(
      rows.rows.map((row) => [
        String(row.id),
        row.address,
        Number(row.authenticated),
      ])
    ).toEqual([
      ["msg_ecrit", "legal@pupitre.studio", 1],
      ["msg_entrant", "support@pupitre.studio", 0],
      ["msg_reponse", "support@pupitre.studio", 1],
    ])
  })

  it("porte sur le fil le dernier expéditeur entrant, ou notre destinataire, et le dernier extrait", async () => {
    const rows = await client.execute(
      'SELECT "id", "senderEmail", "senderName", "senderAuthenticated", "snippet" FROM "MailThread" ORDER BY "id"'
    )

    expect(
      rows.rows.map((row) => [
        String(row.id),
        row.senderEmail,
        row.senderName,
        Number(row.senderAuthenticated),
        row.snippet,
      ])
    ).toEqual([
      ["thr_ecrit", "alex@exemple.fr", null, 1, "Mise en demeure"],
      ["thr_repondu", "camille@exemple.fr", "Camille", 0, "Voici la réponse"],
      ["thr_sans_objet", null, null, 1, null],
    ])
  })

  it("vide le sujet que l'ingestion écrivait en français faute d'objet", async () => {
    const rows = await client.execute(
      'SELECT "subject", "normalizedSubject" FROM "MailThread" WHERE "id" = \'thr_sans_objet\''
    )

    expect(rows.rows[0]?.subject).toBe("")
    expect(rows.rows[0]?.normalizedSubject).toBe("")
  })

  it("accepte le même Message-ID sur deux adresses, et le refuse deux fois sur la même", async () => {
    const insert = (id: string, address: string) =>
      client.execute({
        sql: 'INSERT INTO "MailMessage" ("id", "threadId", "direction", "fromEmail", "toEmails", "ccEmails", "messageId", "address") VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: [
          id,
          "thr_repondu",
          "inbound",
          "camille@exemple.fr",
          "[]",
          "[]",
          "partage@exemple.fr",
          address,
        ],
      })

    await insert("msg_support", "support@pupitre.studio")
    await insert("msg_legal", "legal@pupitre.studio")

    await expect(
      insert("msg_encore", "support@pupitre.studio")
    ).rejects.toThrow()
  })
})
