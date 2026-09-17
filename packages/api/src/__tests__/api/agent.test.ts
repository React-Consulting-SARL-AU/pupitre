import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { ENTITLEMENT_REFRESH_MS } from "../../lib/servers/agent-state"
import { hashEnrollmentToken } from "../../lib/servers/tokens"
import { bootApiTestServer, resetDb } from "../../testing"
import {
  createOrganizationWithMembers,
  createServer,
} from "../../testing/factories"
import { ED25519_KEY, SECOND_ED25519_KEY } from "../../testing/keys"
import {
  HOST_FINGERPRINT,
  HOST_PUBLIC_KEY,
  PROBE_REPORT,
} from "../../testing/probe"
import { apiRequest } from "../../testing/request"

type Session = { token: string }

interface ErrorBody {
  error: { code: string; message: string; fix?: string }
}

interface StateBody {
  entitlement: string
  valid_until: string
  authorized_keys: string[]
  target_version: string | null
  hostname: string
}

const HOUR_MS = 3_600_000

const DAY_MS = 86_400_000

const HEARTBEAT = {
  disk: 41,
  ram: 55,
  load: 1.2,
  sessions: ["dev"],
  stack_version: "1.0.0",
  modules: ["core.system"],
}

function addDevice(session: Session, name: string, publicKey: string) {
  return apiRequest<{ data: { id: string } }>("/me/devices", {
    body: { name, public_key: publicKey },
    session,
  })
}

function exchange(enrollmentToken: string) {
  return apiRequest<{ server_token: string } & ErrorBody>("/agent/exchange", {
    body: {
      enrollment_token: enrollmentToken,
      host_public_key: HOST_PUBLIC_KEY,
      agent_version: "1.4.0",
      arch: "amd64",
    },
  })
}

async function enrolling(host = "vps.test") {
  const { members } = await createOrganizationWithMembers({
    roles: ["owner"],
    subscription: {},
  })
  const [owner] = members
  const device = await addDevice(owner, "MacBook", ED25519_KEY)
  const enrolled = await apiRequest<{
    server_id: string
    enrollment_token: string
  }>("/servers/enroll", {
    body: { device_id: device.json.data.id, host, probe: PROBE_REPORT },
    session: owner,
  })

  return {
    owner,
    serverId: enrolled.json.server_id,
    enrollmentToken: enrolled.json.enrollment_token,
  }
}

describe("POST /agent/exchange", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("burns the enrolment token and activates the server", async () => {
    const { prisma } = await bootApiTestServer()
    const { serverId, enrollmentToken } = await enrolling()
    const response = await exchange(enrollmentToken)

    expect(response.status).toBe(200)
    expect(response.json.server_token.startsWith("pupitre_srv_")).toBe(true)

    const server = await prisma.server.findUniqueOrThrow({
      where: { id: serverId },
    })

    expect(server.status).toBe("active")
    expect(server.arch).toBe("amd64")
    expect(server.agentVersion).toBe("1.4.0")
    expect(server.hostFingerprint).toBe(HOST_FINGERPRINT)
    expect(server.serverTokenHash).not.toBeNull()
    expect(server.serverTokenHash).not.toBe(response.json.server_token)
    expect(server.entitlementValidUntil).not.toBeNull()
  })

  it("refuses a second exchange with enrollment_used", async () => {
    const { enrollmentToken } = await enrolling()

    expect((await exchange(enrollmentToken)).status).toBe(200)

    const second = await exchange(enrollmentToken)

    expect(second.status).toBe(409)
    expect(second.json.error.code).toBe("enrollment_used")
  })

  it("refuses an expired token with enrollment_expired", async () => {
    const { prisma } = await bootApiTestServer()
    const { serverId, enrollmentToken } = await enrolling()

    await prisma.server.update({
      where: { id: serverId },
      data: { enrollmentExpiresAt: new Date(Date.now() - HOUR_MS) },
    })

    const response = await exchange(enrollmentToken)

    expect(response.status).toBe(409)
    expect(response.json.error.code).toBe("enrollment_expired")

    const server = await prisma.server.findUniqueOrThrow({
      where: { id: serverId },
    })

    expect(server.status).toBe("enrolling")
    expect(server.serverTokenHash).toBeNull()
  })

  it("refuses an unknown token", async () => {
    const response = await exchange("pupitre_enr_inconnu")

    expect(response.status).toBe(404)
    expect(response.json.error.code).toBe("not_found")
  })

  it("only stores the hash of the tokens it hands out", async () => {
    const { prisma } = await bootApiTestServer()
    const { serverId, enrollmentToken } = await enrolling()
    const before = await prisma.server.findUniqueOrThrow({
      where: { id: serverId },
    })

    expect(before.enrollmentTokenHash).toBe(
      await hashEnrollmentToken(enrollmentToken)
    )
  })

  it("records the exchange in the audit trail", async () => {
    const { prisma } = await bootApiTestServer()
    const { serverId, enrollmentToken } = await enrolling()

    await exchange(enrollmentToken)

    const event = await prisma.event.findFirstOrThrow({
      where: { action: "server.exchanged" },
    })

    expect(event.targetId).toBe(serverId)
    expect(event.targetType).toBe("server")
    expect(event.actorUserId).toBeNull()
  })
})

describe("GET /agent/state", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("refuses without a server token", async () => {
    const response = await apiRequest<ErrorBody>("/agent/state")

    expect(response.status).toBe(401)
  })

  it("refuses a session token", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const [owner] = members
    const response = await apiRequest<ErrorBody>("/agent/state", {
      session: owner,
    })

    expect(response.status).toBe(401)
    expect(response.json.error.code).toBe("invalid_server_token")
  })

  it("hands the agent its keys, its target version and a 24 hour entitlement", async () => {
    const { prisma } = await bootApiTestServer()
    const { owner, serverId, enrollmentToken } = await enrolling("vps.test")

    await addDevice(owner, "Fixe", SECOND_ED25519_KEY)

    const { server_token } = (await exchange(enrollmentToken)).json
    const response = await apiRequest<StateBody>("/agent/state", {
      bearer: server_token,
    })

    expect(response.status).toBe(200)
    expect(response.json.entitlement).toBe("valid")
    expect(response.json.hostname).toBe("vps.test")
    expect([...response.json.authorized_keys].sort()).toEqual(
      [ED25519_KEY, SECOND_ED25519_KEY].sort()
    )
    expect(response.json.target_version).not.toBeNull()

    const validFor = Date.parse(response.json.valid_until) - Date.now()

    expect(validFor).toBeLessThanOrEqual(DAY_MS)
    expect(validFor).toBeGreaterThan(DAY_MS - 60_000)

    const server = await prisma.server.findUniqueOrThrow({
      where: { id: serverId },
    })
    const lag =
      Date.parse(response.json.valid_until) -
      (server.entitlementValidUntil?.getTime() ?? 0)

    expect(lag).toBeGreaterThanOrEqual(0)
    expect(lag).toBeLessThan(ENTITLEMENT_REFRESH_MS)
  })

  it("writes the row only when the horizon or the target moved", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const { server, token } = await createServer({
      organizationId: organization.id,
    })

    await apiRequest<StateBody>("/agent/state", { bearer: token })

    const written = await prisma.server.findUniqueOrThrow({
      where: { id: server.id },
    })

    expect(written.entitlementValidUntil).not.toBeNull()
    expect(written.updatedAt.getTime()).toBeGreaterThan(
      server.updatedAt.getTime()
    )

    await new Promise((resolve) => setTimeout(resolve, 5))

    const again = await apiRequest<StateBody>("/agent/state", { bearer: token })
    const untouched = await prisma.server.findUniqueOrThrow({
      where: { id: server.id },
    })

    expect(again.status).toBe(200)
    expect(untouched.updatedAt.toISOString()).toBe(
      written.updatedAt.toISOString()
    )
    expect(untouched.entitlementValidUntil?.toISOString()).toBe(
      written.entitlementValidUntil?.toISOString() ?? ""
    )
  })

  it("says suspended for a suspended server", async () => {
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const { token } = await createServer({
      organizationId: organization.id,
      status: "suspended",
    })
    const response = await apiRequest<StateBody>("/agent/state", {
      bearer: token,
    })

    expect(response.status).toBe(200)
    expect(response.json.entitlement).toBe("suspended")
    expect(response.json.authorized_keys).toEqual([])
  })

  it("says grace for a server in grace", async () => {
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const { token } = await createServer({
      organizationId: organization.id,
      status: "grace",
    })
    const response = await apiRequest<StateBody>("/agent/state", {
      bearer: token,
    })

    expect(response.json.entitlement).toBe("grace")
  })
})

describe("POST /agent/heartbeat", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("refuses without a server token", async () => {
    const response = await apiRequest("/agent/heartbeat", { body: HEARTBEAT })

    expect(response.status).toBe(401)
  })

  it("stores the agent version, the heartbeat date and the sample", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const { server, token } = await createServer({
      organizationId: organization.id,
    })
    const response = await apiRequest("/agent/heartbeat", {
      body: { ...HEARTBEAT, agent_version: "1.5.0" },
      bearer: token,
    })

    expect(response.status).toBe(204)

    const stored = await prisma.server.findUniqueOrThrow({
      where: { id: server.id },
    })

    expect(stored.agentVersion).toBe("1.5.0")
    expect(stored.lastHeartbeatAt).not.toBeNull()

    const samples = (stored.metrics as { samples: { disk: number }[] }).samples

    expect(samples).toHaveLength(1)
    expect(samples[0].disk).toBe(41)
  })

  it("keeps the last sample beside the window, for the lists to read", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const { server, token } = await createServer({
      organizationId: organization.id,
    })

    await apiRequest("/agent/heartbeat", {
      body: { ...HEARTBEAT, disk_total_gb: 80, disk_free_gb: 47 },
      bearer: token,
    })

    const stored = await prisma.server.findUniqueOrThrow({
      where: { id: server.id },
    })

    expect(stored.lastUsage).toMatchObject({
      disk: 41,
      ram: 55,
      load: 1.2,
      disk_total_gb: 80,
      disk_free_gb: 47,
      ram_total_mb: null,
    })
    expect(stored.lastUsage).not.toHaveProperty("sessions")
  })

  it("refuses a heartbeat that lists more sessions or modules than a machine has", async () => {
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const { token } = await createServer({ organizationId: organization.id })
    const sessions = await apiRequest<ErrorBody>("/agent/heartbeat", {
      body: { ...HEARTBEAT, sessions: Array.from({ length: 101 }, () => "s") },
      bearer: token,
    })
    const modules = await apiRequest<ErrorBody>("/agent/heartbeat", {
      body: { ...HEARTBEAT, modules: ["x".repeat(201)] },
      bearer: token,
    })

    expect(sessions.status).toBe(422)
    expect(sessions.json.error.code).toBe("validation")
    expect(modules.status).toBe(422)
  })

  it("keeps a rolling window of seven days", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const { server, token } = await createServer({
      organizationId: organization.id,
    })
    const old = new Date(Date.now() - 8 * DAY_MS).toISOString()
    const recent = new Date(Date.now() - DAY_MS).toISOString()

    await prisma.server.update({
      where: { id: server.id },
      data: {
        metrics: {
          samples: [
            { at: old, disk: 1, ram: 1, load: 0, sessions: [], modules: [] },
            { at: recent, disk: 2, ram: 2, load: 0, sessions: [], modules: [] },
          ],
        },
      },
    })
    await apiRequest("/agent/heartbeat", { body: HEARTBEAT, bearer: token })

    const stored = await prisma.server.findUniqueOrThrow({
      where: { id: server.id },
    })
    const samples = (stored.metrics as { samples: { at: string }[] }).samples

    expect(samples).toHaveLength(2)
    expect(samples.map((sample) => sample.at)).not.toContain(old)
    expect(samples[0].at).toBe(recent)
  })
})
