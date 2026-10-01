import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type Client, createClient } from "@libsql/client"

const MIGRATIONS_DIR = join(import.meta.dir, "../../../../db/migrations")

const MIGRATION_FILE_RE = /^\d{4}_.*\.sql$/

const MAIL_V2 = "0009_mail_v2.sql"

function migrationsUpTo(last: string): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => MIGRATION_FILE_RE.test(file) && file < last)
    .sort()
    .map((file) => readFileSync(join(MIGRATIONS_DIR, file), "utf8"))
}

function mailV2(): string {
  return readFileSync(join(MIGRATIONS_DIR, MAIL_V2), "utf8")
}

async function seedThread(
  client: Client,
  input: { id: string; address: string; automated: boolean }
): Promise<void> {
  await client.execute({
    sql: 'INSERT INTO "MailThread" ("id", "address", "subject", "normalizedSubject", "updatedAt") VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
    args: [input.id, input.address, "Objet", "objet"],
  })
  await client.execute({
    sql: 'INSERT INTO "MailMessage" ("id", "threadId", "direction", "fromEmail", "toEmails", "ccEmails", "automated", "createdAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    args: [
      `msg_${input.id}`,
      input.id,
      "inbound",
      "camille@exemple.fr",
      "[]",
      "[]",
      input.automated,
      "2026-01-01T10:00:00.000Z",
    ],
  })
}

describe("migration 0009 on an already populated database", () => {
  let dir: string
  let client: Client

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "pupitre-mail-v2-"))
    client = createClient({ url: `file:${join(dir, "test.sqlite")}` })

    for (const sql of migrationsUpTo(MAIL_V2)) {
      await client.executeMultiple(sql)
    }

    await seedThread(client, {
      id: "thr_humain",
      address: "support@pupitre.studio",
      automated: false,
    })
    await seedThread(client, {
      id: "thr_robot",
      address: "support@pupitre.studio",
      automated: true,
    })
    await client.execute({
      sql: 'INSERT INTO "MailThread" ("id", "address", "subject", "normalizedSubject", "updatedAt") VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
      args: ["thr_vide", "ventes@pupitre.studio", "Objet", "objet"],
    })
    await client.executeMultiple(mailV2())
  })

  afterAll(() => {
    client.close()
    rmSync(dir, { force: true, recursive: true })
  })

  it("files each thread in its address's mailbox, and leaves the others out", async () => {
    const rows = await client.execute(
      'SELECT "id", "mailboxId" FROM "MailThread" ORDER BY "id"'
    )

    expect(rows.rows.map((row) => [String(row.id), row.mailboxId])).toEqual([
      ["thr_humain", "mbx_support"],
      ["thr_robot", "mbx_support"],
      ["thr_vide", null],
    ])
  })

  it("flags as automatic the thread whose last incoming message was, and only that one", async () => {
    const rows = await client.execute(
      'SELECT "id", "lastInboundAutomated" FROM "MailThread" ORDER BY "id"'
    )

    expect(
      rows.rows.map((row) => [String(row.id), Number(row.lastInboundAutomated)])
    ).toEqual([
      ["thr_humain", 0],
      ["thr_robot", 1],
      ["thr_vide", 0],
    ])
  })
})
