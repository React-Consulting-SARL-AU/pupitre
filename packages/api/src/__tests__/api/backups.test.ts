import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import type { BackupBeat, BackupDeclaration } from "@pupitre/shared/backup"
import { type ApiTestServer, bootApiTestServer, resetDb } from "../../testing"
import {
  createOrganizationWithMembers,
  createServer,
  type MemberFixture,
} from "../../testing/factories"
import { apiRequest } from "../../testing/request"

interface ErrorBody {
  error: { code: string; message: string; fix?: string }
}

interface BackupBody {
  id: string
  server_id: string | null
  server_name: string
  created_at: string
  name?: string
  bytes: number
  counts: BackupDeclaration["counts"]
  location: BackupDeclaration["location"]
}

interface ListBody {
  data: BackupBody[]
}

const HEARTBEAT = {
  disk: 41,
  ram: 55,
  load: 1.2,
  sessions: ["dev"],
  stack_version: "1.0.0",
  modules: ["core.system", "core.backup"],
}

const BEAT: BackupBeat = {
  interval_hours: 24,
  last_run_at: "2026-09-19T03:15:00Z",
  last_ok_at: "2026-09-19T03:15:00Z",
}

let harness: ApiTestServer
let sequence = 0

function declaration(
  overrides: Partial<BackupDeclaration> = {}
): BackupDeclaration {
  sequence += 1

  const id = `20260919T0315${String(sequence).padStart(2, "0")}Z-7f3a2c`

  return {
    id,
    created_at: "2026-09-19T03:15:00Z",
    trigger: "schedule",
    bytes: 5_368_709_120,
    counts: { setup: true, home: true, databases: 2, projects: 3, paths: 0 },
    config_revision: 4,
    agent_version: "1.8.0",
    recipient: "A10gydBSR5g4m/L8q8Msuz7sSJNSPyytp4QgelrXxEw=",
    kdf_salt: "lneDgZnxLTb17pcdSfaKvA==",
    location: {
      endpoint: "https://acc.r2.cloudflarestorage.com",
      region: "auto",
      bucket: "pupitre-backups",
      key: `pupitre/srv/${id}`,
      path_style: true,
      sha256: "a".repeat(64),
    },
    ...overrides,
  }
}

function declare(token: string, body: unknown) {
  return apiRequest<{ data: BackupBody } & ErrorBody>("/agent/backups", {
    body,
    bearer: token,
  })
}

async function organizationWithServers() {
  const { organization, members } = await createOrganizationWithMembers({
    roles: ["owner", "admin", "member"],
    subscription: {},
  })
  const [owner, admin, member] = members as [
    MemberFixture,
    MemberFixture,
    MemberFixture,
  ]
  const mine = await createServer({
    organizationId: organization.id,
    name: "vps-member",
    assignedUserId: member.user.id,
  })
  const other = await createServer({
    organizationId: organization.id,
    name: "vps-other",
    assignedUserId: owner.user.id,
  })

  return { organization, owner, admin, member, mine, other }
}

describe("GET /agent/state et le heartbeat", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("rend l'identifiant du serveur, qui nomme son préfixe dans le seau", async () => {
    const { mine } = await organizationWithServers()
    const response = await apiRequest<{ server_id: string }>("/agent/state", {
      bearer: mine.token,
    })

    expect(response.status).toBe(200)
    expect(response.json.server_id).toBe(mine.server.id)
  })

  it("garde le battement de sauvegarde, et le connu quand l'agent le tait", async () => {
    const { owner, mine } = await organizationWithServers()

    const telling = await apiRequest("/agent/heartbeat", {
      body: { ...HEARTBEAT, backup: BEAT },
      bearer: mine.token,
    })

    expect(telling.status).toBe(204)

    await apiRequest("/agent/heartbeat", {
      body: HEARTBEAT,
      bearer: mine.token,
    })

    const detail = await apiRequest<{ data: { backup: BackupBeat | null } }>(
      `/servers/${mine.server.id}`,
      { session: owner }
    )

    expect(detail.json.data.backup).toEqual(BEAT)

    const list = await apiRequest<{
      data: { id: string; backup: BackupBeat | null }[]
    }>("/servers", { session: owner })

    expect(
      list.json.data.find((server) => server.id === mine.server.id)?.backup
    ).toEqual(BEAT)
    expect(
      list.json.data.find((server) => server.id !== mine.server.id)?.backup
    ).toBeNull()
  })

  it("refuse un battement hors du contrat", async () => {
    const { mine } = await organizationWithServers()
    const response = await apiRequest<ErrorBody>("/agent/heartbeat", {
      body: {
        ...HEARTBEAT,
        backup: { ...BEAT, last_error: "x".repeat(501) },
      },
      bearer: mine.token,
    })

    expect(response.status).toBe(422)
    expect(response.json.error.code).toBe("validation")
  })
})

describe("POST /agent/backups", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("refuse sans jeton de serveur", async () => {
    const response = await declare("", declaration())

    expect(response.status).toBe(401)
  })

  it("crée la référence, sans rien qui nomme un projet ou une base, et la journalise", async () => {
    const { organization, mine } = await organizationWithServers()
    const body = declaration()
    const response = await declare(mine.token, body)

    expect(response.status).toBe(201)
    expect(response.json.data).toEqual({
      id: body.id,
      server_id: mine.server.id,
      server_name: "vps-member",
      created_at: "2026-09-19T03:15:00.000Z",
      trigger: "schedule",
      bytes: 5_368_709_120,
      counts: body.counts,
      config_revision: 4,
      agent_version: "1.8.0",
      recipient: body.recipient,
      kdf_salt: body.kdf_salt,
      location: body.location,
    } as BackupBody)

    const event = await harness.prisma.event.findFirstOrThrow({
      where: { action: "backup.created" },
    })

    expect(event.organizationId).toBe(organization.id)
    expect(event.targetType).toBe("backup")
    expect(event.targetId).toBe(body.id)
  })

  it("garde le nom donné à une sauvegarde manuelle et le rend avec elle", async () => {
    const { owner, mine } = await organizationWithServers()
    const body = declaration({ trigger: "manual", name: "Avant la migration" })

    const response = await declare(mine.token, body)
    const listed = await apiRequest<ListBody>("/backups", { session: owner })

    expect(response.status).toBe(201)
    expect(response.json.data.name).toBe("Avant la migration")
    expect(listed.json.data[0]?.name).toBe("Avant la migration")
  })

  it("refuse un nom hors du contrat", async () => {
    const { mine } = await organizationWithServers()

    for (const name of [" avant ", "a\nb", "x".repeat(81)]) {
      const response = await declare(mine.token, declaration({ name }))

      expect(response.status).toBe(422)
    }
  })

  it("rend 200 et la même ligne quand le même serveur redéclare", async () => {
    const { mine } = await organizationWithServers()
    const body = declaration()

    await declare(mine.token, body)

    const again = await declare(mine.token, body)

    expect(again.status).toBe(200)
    expect(again.json.data.id).toBe(body.id)
    expect(await harness.prisma.backup.count()).toBe(1)
    expect(
      await harness.prisma.event.count({ where: { action: "backup.created" } })
    ).toBe(1)
  })

  it("refuse l'identifiant qu'un autre serveur de l'organisation porte", async () => {
    const { mine, other } = await organizationWithServers()
    const body = declaration()

    await declare(mine.token, body)

    const response = await declare(other.token, body)

    expect(response.status).toBe(409)
    expect(response.json.error.code).toBe("conflict")
    expect(response.json.error.message).toContain(body.id)
    expect(response.json.error.fix).toBeDefined()
  })

  it("laisse le même identifiant à une autre organisation", async () => {
    const { mine } = await organizationWithServers()
    const elsewhere = await organizationWithServers()
    const body = declaration()

    expect((await declare(mine.token, body)).status).toBe(201)
    expect((await declare(elsewhere.mine.token, body)).status).toBe(201)
  })

  it("refuse une déclaration hors du contrat", async () => {
    const { mine } = await organizationWithServers()
    const badId = await declare(mine.token, declaration({ id: "backup-1" }))
    const noDigest = await declare(mine.token, {
      ...declaration(),
      location: { ...declaration().location, sha256: undefined },
    })
    const extraField = await declare(mine.token, {
      ...declaration(),
      location: { ...declaration().location, secret_key: "nope" },
    })

    expect(badId.status).toBe(422)
    expect(noDigest.status).toBe(422)
    expect(extraField.status).toBe(422)
  })
})

describe("DELETE /agent/backups/:id", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("retire la référence d'une sauvegarde de ce serveur et la journalise", async () => {
    const { mine } = await organizationWithServers()
    const body = declaration()

    await declare(mine.token, body)

    const response = await apiRequest(`/agent/backups/${body.id}`, {
      method: "DELETE",
      bearer: mine.token,
    })

    expect(response.status).toBe(204)
    expect(await harness.prisma.backup.count()).toBe(0)
    expect(
      await harness.prisma.event.count({ where: { action: "backup.deleted" } })
    ).toBe(1)
  })

  it("rend 404 pour la sauvegarde d'un autre serveur, sans la toucher", async () => {
    const { mine, other } = await organizationWithServers()
    const body = declaration()

    await declare(mine.token, body)

    const response = await apiRequest<ErrorBody>(`/agent/backups/${body.id}`, {
      method: "DELETE",
      bearer: other.token,
    })

    expect(response.status).toBe(404)
    expect(response.json.error.code).toBe("not_found")
    expect(await harness.prisma.backup.count()).toBe(1)
  })
})

describe("GET /backups et GET /servers/:id/backups", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("rend les sauvegardes les plus récentes d'abord, celles des serveurs effacés comprises", async () => {
    const { owner, mine, other } = await organizationWithServers()
    const older = declaration({ created_at: "2026-09-18T03:00:00Z" })
    const newer = declaration({ created_at: "2026-09-19T03:00:00Z" })
    const orphan = declaration({ created_at: "2026-09-17T03:00:00Z" })

    await declare(mine.token, older)
    await declare(mine.token, newer)
    await declare(other.token, orphan)
    await harness.prisma.server.delete({ where: { id: other.server.id } })

    const response = await apiRequest<ListBody>("/backups", { session: owner })

    expect(response.status).toBe(200)
    expect(response.json.data.map((backup) => backup.id)).toEqual([
      newer.id,
      older.id,
      orphan.id,
    ])
    expect(response.json.data[2]).toMatchObject({
      server_id: null,
      server_name: "vps-other",
    })
  })

  it("ne montre à un member que les sauvegardes des serveurs qui lui sont attribués", async () => {
    const { admin, member, mine, other } = await organizationWithServers()
    const own = declaration()
    const foreign = declaration()

    await declare(mine.token, own)
    await declare(other.token, foreign)

    const asMember = await apiRequest<ListBody>("/backups", {
      session: member,
    })
    const asAdmin = await apiRequest<ListBody>("/backups", { session: admin })

    expect(asMember.json.data.map((backup) => backup.id)).toEqual([own.id])
    expect(asAdmin.json.data).toHaveLength(2)

    const ownServer = await apiRequest<ListBody>(
      `/servers/${mine.server.id}/backups`,
      { session: member }
    )
    const foreignServer = await apiRequest<ErrorBody>(
      `/servers/${other.server.id}/backups`,
      { session: member }
    )

    expect(ownServer.status).toBe(200)
    expect(ownServer.json.data.map((backup) => backup.id)).toEqual([own.id])
    expect(foreignServer.status).toBe(404)
  })

  it("ne montre rien d'une autre organisation", async () => {
    const { mine } = await organizationWithServers()
    const elsewhere = await organizationWithServers()

    await declare(mine.token, declaration())

    const list = await apiRequest<ListBody>("/backups", {
      session: elsewhere.owner,
    })
    const server = await apiRequest<ErrorBody>(
      `/servers/${mine.server.id}/backups`,
      { session: elsewhere.owner }
    )

    expect(list.json.data).toEqual([])
    expect(server.status).toBe(404)
  })

  it("refuse sans session", async () => {
    const response = await apiRequest<ErrorBody>("/backups")

    expect(response.status).toBe(401)
  })
})

describe("POST /backups/:id/forget", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("efface la référence pour un admin et la journalise", async () => {
    const { admin, other } = await organizationWithServers()
    const body = declaration()

    await declare(other.token, body)

    const response = await apiRequest(`/backups/${body.id}/forget`, {
      method: "POST",
      session: admin,
    })

    expect(response.status).toBe(204)

    const list = await apiRequest<ListBody>("/backups", { session: admin })

    expect(list.json.data).toEqual([])
    expect(
      await harness.prisma.backup.count({ where: { backupId: body.id } })
    ).toBe(0)

    const event = await harness.prisma.event.findFirstOrThrow({
      where: { action: "backup.forgotten" },
    })

    expect(event.actorUserId).toBe(admin.user.id)
    expect(event.targetId).toBe(body.id)
  })

  it("refuse un member", async () => {
    const { member, mine } = await organizationWithServers()
    const body = declaration()

    await declare(mine.token, body)

    const response = await apiRequest<ErrorBody>(`/backups/${body.id}/forget`, {
      method: "POST",
      session: member,
    })

    expect(response.status).toBe(403)
  })

  it("rend 404 pour une sauvegarde inconnue ou déjà oubliée", async () => {
    const { owner, mine } = await organizationWithServers()
    const body = declaration()

    await declare(mine.token, body)
    await apiRequest(`/backups/${body.id}/forget`, {
      method: "POST",
      session: owner,
    })

    const again = await apiRequest<ErrorBody>(`/backups/${body.id}/forget`, {
      method: "POST",
      session: owner,
    })

    expect(again.status).toBe(404)
  })
})

describe("POST /backups/:id/restored", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("note la restauration au journal, sur la sauvegarde", async () => {
    const { owner, mine, other } = await organizationWithServers()
    const body = declaration()

    await declare(other.token, body)

    const response = await apiRequest(`/backups/${body.id}/restored`, {
      body: { server_id: mine.server.id },
      session: owner,
    })

    expect(response.status).toBe(204)

    const event = await harness.prisma.event.findFirstOrThrow({
      where: { action: "backup.restored" },
    })

    expect(event.targetType).toBe("backup")
    expect(event.targetId).toBe(body.id)
    expect(event.actorUserId).toBe(owner.user.id)
    expect(event.payload).toMatchObject({ server_id: mine.server.id })
  })

  it("rend 404 quand la sauvegarde ou le serveur échappe à l'appelant", async () => {
    const { member, mine, other } = await organizationWithServers()
    const foreign = declaration()
    const own = declaration()

    await declare(other.token, foreign)
    await declare(mine.token, own)

    const foreignBackup = await apiRequest<ErrorBody>(
      `/backups/${foreign.id}/restored`,
      { body: { server_id: mine.server.id }, session: member }
    )
    const foreignServer = await apiRequest<ErrorBody>(
      `/backups/${own.id}/restored`,
      { body: { server_id: other.server.id }, session: member }
    )

    expect(foreignBackup.status).toBe(404)
    expect(foreignServer.status).toBe(404)
    expect(
      await harness.prisma.event.count({ where: { action: "backup.restored" } })
    ).toBe(0)
  })
})
