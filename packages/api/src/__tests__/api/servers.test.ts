import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { authorizedKeysForServer } from "../../lib/servers/authorized-keys"
import { DECOMMISSION_DELAY_MS } from "../../lib/servers/expire"
import { bootApiTestServer, resetDb } from "../../testing"
import { createOrganizationWithMembers } from "../../testing/factories"
import { ED25519_KEY, SECOND_ED25519_KEY } from "../../testing/keys"
import { HOST_PUBLIC_KEY, PROBE_REPORT } from "../../testing/probe"
import { apiRequest } from "../../testing/request"

type Session = { token: string }

interface EnrollBody {
  server_id: string
  enrollment_token: string
  release: { version: string; url: string; sha256: string; signature: string }
}

interface ServerBody {
  id: string
  name: string
  host: string | null
  port: number
  user: string
  arch: string
  status: string
  stale: boolean
  agent_version: string | null
  target_version: string | null
  host_fingerprint: string | null
  assigned_user_id: string | null
  last_heartbeat_at: string | null
  usage: { at: string; disk: number; ram: number; load: number } | null
  created_at: string
}

interface ServerDetailBody extends ServerBody {
  metrics: { at: string; disk: number }[]
  events: { action: string }[]
}

interface ErrorBody {
  error: { code: string; message: string; fix?: string }
}

const DAY_MS = 86_400_000

function addDevice(session: Session, name: string, publicKey: string) {
  return apiRequest<{ data: { id: string } }>("/me/devices", {
    body: { name, public_key: publicKey },
    session,
  })
}

function enroll(
  session: Session,
  deviceId: string,
  host: string,
  extra: Record<string, unknown> = {}
) {
  return apiRequest<EnrollBody & ErrorBody>("/servers/enroll", {
    body: { device_id: deviceId, host, probe: PROBE_REPORT, ...extra },
    session,
  })
}

function exchange(enrollmentToken: string) {
  return apiRequest<{ server_token: string }>("/agent/exchange", {
    body: {
      enrollment_token: enrollmentToken,
      host_public_key: HOST_PUBLIC_KEY,
      agent_version: "1.4.0",
      arch: "amd64",
    },
  })
}

function listServers(session: Session) {
  return apiRequest<{ data: ServerBody[] }>("/servers", { session })
}

async function enrolledServer(
  session: Session,
  host: string,
  publicKey: string = ED25519_KEY
) {
  const device = await addDevice(session, `poste ${host}`, publicKey)
  const enrolled = await enroll(session, device.json.data.id, host)
  const exchanged = await exchange(enrolled.json.enrollment_token)

  return {
    serverId: enrolled.json.server_id,
    token: exchanged.json.server_token,
  }
}

describe("POST /servers/enroll", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("refuses without a session", async () => {
    const response = await apiRequest("/servers/enroll", {
      body: { device_id: "x", host: "vps.test", probe: PROBE_REPORT },
    })

    expect(response.status).toBe(401)
  })

  it("creates an enrolling server and hands out a one-hour token", async () => {
    const { prisma } = await bootApiTestServer()
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const [owner] = members
    const device = await addDevice(owner, "MacBook", ED25519_KEY)
    const response = await enroll(owner, device.json.data.id, "vps.test", {
      port: 2222,
      ssh_user: "dev",
    })

    expect(response.status).toBe(201)
    expect(response.json.enrollment_token.length).toBeGreaterThan(20)
    expect(response.json.release.version.length).toBeGreaterThan(0)

    const server = await prisma.server.findUniqueOrThrow({
      where: { id: response.json.server_id },
    })

    expect(server.status).toBe("enrolling")
    expect(server.host).toBe("vps.test")
    expect(server.port).toBe(2222)
    expect(server.sshUser).toBe("dev")
    expect(server.deviceId).toBe(device.json.data.id)
    expect(server.assignedUserId).toBe(owner.user.id)
    expect(server.serverTokenHash).toBeNull()
    expect(server.enrollmentTokenHash).not.toBeNull()
    expect(server.enrollmentTokenHash).not.toBe(response.json.enrollment_token)

    const ttl = (server.enrollmentExpiresAt?.getTime() ?? 0) - Date.now()

    expect(ttl).toBeLessThanOrEqual(3_600_000)
    expect(ttl).toBeGreaterThan(3_500_000)
  })

  it("defaults the port to 22 and the ssh user to dev", async () => {
    const { prisma } = await bootApiTestServer()
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const [owner] = members
    const device = await addDevice(owner, "MacBook", ED25519_KEY)
    const response = await enroll(owner, device.json.data.id, "vps.test")
    const server = await prisma.server.findUniqueOrThrow({
      where: { id: response.json.server_id },
    })

    expect(server.port).toBe(22)
    expect(server.sshUser).toBe("dev")
  })

  it("refuses a device that is not the caller's", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
    })
    const [owner, member] = members
    const device = await addDevice(member, "Poste du membre", ED25519_KEY)
    const response = await enroll(owner, device.json.data.id, "vps.test")

    expect(response.status).toBe(404)
    expect(response.json.error.code).toBe("not_found")
  })

  it("refuses the third server of a development organization with a fix", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const [owner] = members
    const device = await addDevice(owner, "MacBook", ED25519_KEY)
    const deviceId = device.json.data.id

    expect((await enroll(owner, deviceId, "vps-1.test")).status).toBe(201)
    expect((await enroll(owner, deviceId, "vps-2.test")).status).toBe(201)

    const third = await enroll(owner, deviceId, "vps-3.test")

    expect(third.status).toBe(403)
    expect(third.json.error.code).toBe("seat_quota_reached")
    expect(third.json.error.fix).toBeTruthy()
  })

  it("follows the subscription quantity when the organization has one", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const [owner] = members

    await prisma.subscription.create({
      data: {
        organizationId: organization.id,
        stripeSubscriptionId: "sub_test_1",
        product: "server",
        quantity: 1,
        status: "active",
      },
    })

    const device = await addDevice(owner, "MacBook", ED25519_KEY)
    const deviceId = device.json.data.id

    expect((await enroll(owner, deviceId, "vps-1.test")).status).toBe(201)

    const second = await enroll(owner, deviceId, "vps-2.test")

    expect(second.status).toBe(403)
    expect(second.json.error.code).toBe("seat_quota_reached")
  })

  it("frees the seat of a revoked server", async () => {
    const { prisma } = await bootApiTestServer()
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const [owner] = members
    const device = await addDevice(owner, "MacBook", ED25519_KEY)
    const deviceId = device.json.data.id
    const first = await enroll(owner, deviceId, "vps-1.test")

    await enroll(owner, deviceId, "vps-2.test")
    await prisma.server.update({
      where: { id: first.json.server_id },
      data: { status: "revoked" },
    })

    expect((await enroll(owner, deviceId, "vps-3.test")).status).toBe(201)
  })

  it("records the enrolment in the audit trail", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const [owner] = members
    const device = await addDevice(owner, "MacBook", ED25519_KEY)
    const response = await enroll(owner, device.json.data.id, "vps.test")
    const event = await prisma.event.findFirstOrThrow({
      where: { action: "server.enrolled" },
    })

    expect(event.targetId).toBe(response.json.server_id)
    expect(event.targetType).toBe("server")
    expect(event.actorUserId).toBe(owner.user.id)
    expect(event.organizationId).toBe(organization.id)
  })
})

describe("GET /servers", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("refuses without a session", async () => {
    expect((await apiRequest("/servers")).status).toBe(401)
  })

  it("lists the servers of the active organization only", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const other = await createOrganizationWithMembers({ roles: ["owner"] })
    const [owner] = members
    const [otherOwner] = other.members

    await enrolledServer(owner, "vps-mien.test")
    await enrolledServer(otherOwner, "vps-autre.test", SECOND_ED25519_KEY)

    const response = await listServers(owner)

    expect(response.status).toBe(200)
    expect(response.json.data).toHaveLength(1)
    expect(response.json.data[0]).toMatchObject({
      host: "vps-mien.test",
      port: 22,
      user: "dev",
      status: "active",
      arch: "amd64",
      stale: false,
    })
  })

  it("marks a server without heartbeat for 24 hours as stale, without touching its entitlement", async () => {
    const { prisma } = await bootApiTestServer()
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const [owner] = members
    const { serverId, token } = await enrolledServer(owner, "vps.test")

    await apiRequest("/agent/heartbeat", {
      body: {
        disk: 12,
        ram: 30,
        load: 0.4,
        sessions: [],
        stack_version: "1.0.0",
        modules: [],
      },
      bearer: token,
    })

    expect((await listServers(owner)).json.data[0].stale).toBe(false)

    await prisma.server.update({
      where: { id: serverId },
      data: { lastHeartbeatAt: new Date(Date.now() - 25 * 3_600_000) },
    })

    const listed = (await listServers(owner)).json.data[0]

    expect(listed.stale).toBe(true)
    expect(listed.status).toBe("active")

    const stored = await prisma.server.findUniqueOrThrow({
      where: { id: serverId },
    })

    expect(stored.status).toBe("active")

    const state = await apiRequest<{ entitlement: string }>("/agent/state", {
      bearer: token,
    })

    expect(state.status).toBe(200)
    expect(state.json.entitlement).toBe("valid")
  })
})

describe("GET /servers/:id", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("returns the server with its metrics and its events", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const [owner] = members
    const { serverId, token } = await enrolledServer(owner, "vps.test")

    await apiRequest("/agent/heartbeat", {
      body: {
        disk: 41,
        ram: 55,
        load: 1.2,
        sessions: ["dev"],
        stack_version: "1.0.0",
        modules: ["core.system"],
      },
      bearer: token,
    })

    const response = await apiRequest<{ data: ServerDetailBody }>(
      `/servers/${serverId}`,
      { session: owner }
    )

    expect(response.status).toBe(200)
    expect(response.json.data.host).toBe("vps.test")
    expect(response.json.data.metrics).toHaveLength(1)
    expect(response.json.data.metrics[0].disk).toBe(41)
    expect(response.json.data.usage).toMatchObject({ disk: 41, ram: 55 })

    const list = await apiRequest<{ data: ServerBody[] }>("/servers", {
      session: owner,
    })

    expect(list.json.data[0].usage).toMatchObject({ disk: 41, ram: 55 })
    expect(response.json.data.events.map((event) => event.action)).toContain(
      "server.enrolled"
    )
  })

  it("hides a server of another organization", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const other = await createOrganizationWithMembers({ roles: ["owner"] })
    const [owner] = members
    const [otherOwner] = other.members
    const { serverId } = await enrolledServer(
      otherOwner,
      "vps-autre.test",
      SECOND_ED25519_KEY
    )
    const response = await apiRequest<ErrorBody>(`/servers/${serverId}`, {
      session: owner,
    })

    expect(response.status).toBe(404)
    expect(response.json.error.code).toBe("not_found")
  })
})

describe("DELETE /servers/:id", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("refuses a member", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
    })
    const [owner, member] = members
    const { serverId } = await enrolledServer(owner, "vps.test")
    const response = await apiRequest<ErrorBody>(`/servers/${serverId}`, {
      method: "DELETE",
      session: member,
    })

    expect(response.status).toBe(403)
    expect(response.json.error.code).toBe("forbidden")
  })

  it("removes the keys from /agent/state and schedules the decommission at seven days", async () => {
    const { prisma } = await bootApiTestServer()
    const { members } = await createOrganizationWithMembers({
      roles: ["owner", "admin"],
    })
    const [owner, admin] = members
    const { serverId, token } = await enrolledServer(owner, "vps.test")

    expect(await authorizedKeysForServer(prisma, serverId)).toEqual([
      ED25519_KEY,
    ])

    const state = await apiRequest<{ authorized_keys: string[] }>(
      "/agent/state",
      { bearer: token }
    )

    expect(state.json.authorized_keys).toEqual([ED25519_KEY])

    const deleted = await apiRequest(`/servers/${serverId}`, {
      method: "DELETE",
      session: admin,
    })

    expect(deleted.status).toBe(204)
    expect(await authorizedKeysForServer(prisma, serverId)).toEqual([])

    const refused = await apiRequest<ErrorBody>("/agent/state", {
      bearer: token,
    })

    expect(refused.status).toBe(401)
    expect(refused.json.error.code).toBe("invalid_server_token")

    const server = await prisma.server.findUniqueOrThrow({
      where: { id: serverId },
    })

    expect(server.status).toBe("revoked")
    expect(server.assignedUserId).toBeNull()

    const delay = (server.decommissionAt?.getTime() ?? 0) - Date.now()

    expect(DECOMMISSION_DELAY_MS).toBe(7 * DAY_MS)
    expect(delay).toBeLessThanOrEqual(DECOMMISSION_DELAY_MS)
    expect(delay).toBeGreaterThan(DECOMMISSION_DELAY_MS - 60_000)

    const event = await prisma.event.findFirstOrThrow({
      where: { action: "server.deleted" },
    })

    expect(event.targetId).toBe(serverId)
    expect(event.actorUserId).toBe(admin.user.id)
  })

  it("refuses a server of another organization", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const other = await createOrganizationWithMembers({ roles: ["owner"] })
    const [owner] = members
    const [otherOwner] = other.members
    const { serverId } = await enrolledServer(
      otherOwner,
      "vps-autre.test",
      SECOND_ED25519_KEY
    )
    const response = await apiRequest(`/servers/${serverId}`, {
      method: "DELETE",
      session: owner,
    })

    expect(response.status).toBe(404)
  })
})

describe("GET /me/servers", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("reports the real host, port and ssh user", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const [owner] = members
    const device = await addDevice(owner, "MacBook", ED25519_KEY)

    await enroll(owner, device.json.data.id, "vps.test", {
      port: 2222,
      ssh_user: "jordan",
    })

    const response = await apiRequest<{
      data: { host: string; port: number; user: string; key_ready: boolean }[]
    }>("/me/servers", { session: owner })

    expect(response.json.data[0]).toMatchObject({
      host: "vps.test",
      port: 2222,
      user: "jordan",
      key_ready: true,
    })
  })
})
