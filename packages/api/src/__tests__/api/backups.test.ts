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

describe("GET /agent/state and the heartbeat", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("returns the server identifier, which names its prefix in the bucket", async () => {
    const { mine } = await organizationWithServers()
    const response = await apiRequest<{ server_id: string }>("/agent/state", {
      bearer: mine.token,
    })

    expect(response.status).toBe(200)
    expect(response.json.server_id).toBe(mine.server.id)
  })

  it("keeps the backup beat, and the known one when the agent omits it", async () => {
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

  it("refuses a beat outside the contract", async () => {
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

  it("refuses without a server token", async () => {
    const response = await declare("", declaration())

    expect(response.status).toBe(401)
  })

  it("creates the reference, with nothing naming a project or a database, and logs it", async () => {
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

  it("keeps the name given to a manual backup and returns it with it", async () => {
    const { owner, mine } = await organizationWithServers()
    const body = declaration({ trigger: "manual", name: "Avant la migration" })

    const response = await declare(mine.token, body)
    const listed = await apiRequest<ListBody>("/backups", { session: owner })

    expect(response.status).toBe(201)
    expect(response.json.data.name).toBe("Avant la migration")
    expect(listed.json.data[0]?.name).toBe("Avant la migration")
  })

  it("refuses a name outside the contract", async () => {
    const { mine } = await organizationWithServers()

    for (const name of [" avant ", "a\nb", "x".repeat(81)]) {
      const response = await declare(mine.token, declaration({ name }))

      expect(response.status).toBe(422)
    }
  })

  it("returns 200 and the same row when the same server declares again", async () => {
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

  it("refuses the identifier that another server of the organization holds", async () => {
    const { mine, other } = await organizationWithServers()
    const body = declaration()

    await declare(mine.token, body)

    const response = await declare(other.token, body)

    expect(response.status).toBe(409)
    expect(response.json.error.code).toBe("conflict")
    expect(response.json.error.message).toContain(body.id)
    expect(response.json.error.fix).toBeDefined()
  })

  it("allows the same identifier in another organization", async () => {
    const { mine } = await organizationWithServers()
    const elsewhere = await organizationWithServers()
    const body = declaration()

    expect((await declare(mine.token, body)).status).toBe(201)
    expect((await declare(elsewhere.mine.token, body)).status).toBe(201)
  })

  it("refuses a declaration outside the contract", async () => {
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

  it("removes the reference of a backup of this server and logs it", async () => {
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

  it("returns 404 for another server's backup, without touching it", async () => {
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

describe("GET /backups and GET /servers/:id/backups", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("returns the most recent backups first, including those of erased servers", async () => {
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

  it("shows a member only the backups of the servers assigned to them", async () => {
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

  it("shows nothing from another organization", async () => {
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

  it("refuses without a session", async () => {
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

  it("erases the reference for an admin and logs it", async () => {
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

  it("refuses a member", async () => {
    const { member, mine } = await organizationWithServers()
    const body = declaration()

    await declare(mine.token, body)

    const response = await apiRequest<ErrorBody>(`/backups/${body.id}/forget`, {
      method: "POST",
      session: member,
    })

    expect(response.status).toBe(403)
  })

  it("returns 404 for an unknown or already forgotten backup", async () => {
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

  it("notes the restore in the log, on the backup", async () => {
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

  it("returns 404 when the backup or the server is out of the caller's reach", async () => {
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
