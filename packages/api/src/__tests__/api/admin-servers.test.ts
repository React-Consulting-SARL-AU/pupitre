import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { authorizedKeysForServer } from "../../lib/servers/authorized-keys"
import { type ApiTestServer, bootApiTestServer, resetDb } from "../../testing"
import {
  createOrganizationWithMembers,
  createServer,
} from "../../testing/factories"
import { ED25519_KEY } from "../../testing/keys"
import { apiRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

interface AdminServer {
  id: string
  name: string
  host: string | null
  status: string
  suspended_reason: string | null
  stale: boolean
  organization: { id: string; name: string; slug: string }
  assigned_user_id: string | null
}

interface ListBody {
  data: AdminServer[]
  total: number
}

interface AdminServerDevice {
  id: string
  name: string
  last_used_at: string | null
  user: { id: string; email: string }
}

interface AdminServerDetail extends AdminServer {
  channel: string
  enrollment_expires_at: string | null
  device: AdminServerDevice | null
  revoked_devices: {
    device: AdminServerDevice
    revoked_by: { id: string; email: string } | null
    revoked_at: string
  }[]
  metrics: { at: string; disk: number }[]
  alerts: { kind: string; first_seen_at: string }[]
  usage: { disk: number } | null
  pending_assignment_email: string | null
}

interface ErrorBody {
  error: { code: string; message: string; fix?: string }
}

interface StateBody {
  entitlement: string
  authorized_keys: string[]
}

const DAY_MS = 86_400_000

async function platformAdmin() {
  const { user } = await createUser({
    email: "support@pupitre.studio",
    role: "platform_admin",
  })

  return await createSession({ userId: user.id })
}

async function twoOrganizations() {
  const one = await createOrganizationWithMembers({
    name: "Atelier",
    roles: ["owner"],
    subscription: {},
  })
  const two = await createOrganizationWithMembers({
    name: "Bureau",
    roles: ["owner"],
    subscription: {},
  })
  const [oneOwner] = one.members
  const active = await createServer({
    organizationId: one.organization.id,
    name: "vps-atelier",
    assignedUserId: oneOwner.user.id,
  })
  const graced = await createServer({
    organizationId: two.organization.id,
    name: "vps-bureau",
    status: "grace",
  })

  await apiRequest("/me/devices", {
    body: { name: "MacBook", public_key: ED25519_KEY },
    session: oneOwner,
  })

  return { one, two, active, graced }
}

describe("GET /admin/servers", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("refuses an anonymous caller and a plain owner", async () => {
    const { one } = await twoOrganizations()
    const anonymous = await apiRequest<ErrorBody>("/admin/servers")
    const owner = await apiRequest<ErrorBody>("/admin/servers", {
      session: one.members[0],
    })

    expect(anonymous.status).toBe(401)
    expect(owner.status).toBe(403)
    expect(owner.json.error.code).toBe("forbidden")
  })

  it("lists every server of every organization, with the organization named", async () => {
    const { one, two } = await twoOrganizations()
    const admin = await platformAdmin()
    const response = await apiRequest<ListBody>("/admin/servers", {
      session: admin,
    })

    expect(response.status).toBe(200)
    expect(response.json.total).toBe(2)
    expect(
      response.json.data.map((server) => server.organization.name).sort()
    ).toEqual([one.organization.name, two.organization.name])
    expect(response.json.data[0]?.organization.slug).toBeString()
  })

  it("filters by status, by organization and by host or name", async () => {
    const { two, graced } = await twoOrganizations()
    const admin = await platformAdmin()
    const byStatus = await apiRequest<ListBody>("/admin/servers?status=grace", {
      session: admin,
    })
    const byOrganization = await apiRequest<ListBody>(
      `/admin/servers?organization_id=${two.organization.id}`,
      { session: admin }
    )
    const byName = await apiRequest<ListBody>("/admin/servers?q=atelier", {
      session: admin,
    })
    const none = await apiRequest<ListBody>("/admin/servers?status=revoked", {
      session: admin,
    })

    expect(byStatus.json.data.map((server) => server.id)).toEqual([
      graced.server.id,
    ])
    expect(byOrganization.json.data.map((server) => server.id)).toEqual([
      graced.server.id,
    ])
    expect(byName.json.data.map((server) => server.name)).toEqual([
      "vps-atelier",
    ])
    expect(none.json).toEqual({ data: [], total: 0 })
  })

  it("refuses an unknown status", async () => {
    const admin = await platformAdmin()
    const response = await apiRequest<ErrorBody>("/admin/servers?status=lost", {
      session: admin,
    })

    expect(response.status).toBe(422)
    expect(response.json.error.code).toBe("validation")
  })

  it("stays out of the OpenAPI document", async () => {
    const document = await apiRequest<{ paths: Record<string, unknown> }>(
      "/openapi/json"
    )

    expect(Object.keys(document.json.paths)).not.toContain(
      "/api/v1/admin/servers"
    )
    expect(Object.keys(document.json.paths)).not.toContain(
      "/api/v1/admin/servers/{id}/suspend"
    )
  })
})

describe("POST /admin/servers/:id/suspend", () => {
  let server: ApiTestServer

  beforeAll(async () => {
    server = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("suspends the server, drops its keys, tells the owner and writes the journal", async () => {
    const { one, active } = await twoOrganizations()
    const admin = await platformAdmin()
    const before = await apiRequest<StateBody>("/agent/state", {
      bearer: active.token,
    })

    expect(before.json.entitlement).toBe("valid")
    expect(before.json.authorized_keys).toHaveLength(1)

    const response = await apiRequest<{ data: AdminServer }>(
      `/admin/servers/${active.server.id}/suspend`,
      {
        body: { reason: "Abuse report 4412: outbound scanning" },
        session: admin,
      }
    )

    expect(response.status).toBe(200)
    expect(response.json.data).toMatchObject({
      id: active.server.id,
      status: "suspended",
      suspended_reason: "admin",
    })

    const state = await apiRequest<StateBody>("/agent/state", {
      bearer: active.token,
    })

    expect(state.json.entitlement).toBe("suspended")
    expect(state.json.authorized_keys).toEqual([])
    expect(
      await authorizedKeysForServer(server.prisma, active.server.id)
    ).toEqual([])

    const event = await server.prisma.event.findFirstOrThrow({
      where: { action: "server.suspended", targetId: active.server.id },
    })

    expect(event.actorUserId).toBe(admin.session.userId)
    expect(event.organizationId).toBe(one.organization.id)
    expect(event.payload).toMatchObject({
      reason: "Abuse report 4412: outbound scanning",
    })

    const email = server.sentEmails.at(-1)

    expect(email?.to).toBe(one.members[0].user.email)
    expect(email?.text).toContain("Abuse report 4412")
    expect(email?.text).toContain("vps-atelier")
  })

  it("keeps the server suspended when the subscription comes back", async () => {
    const { active } = await twoOrganizations()
    const admin = await platformAdmin()

    await apiRequest(`/admin/servers/${active.server.id}/suspend`, {
      body: { reason: "Abuse" },
      session: admin,
    })

    const stored = await server.prisma.server.findUniqueOrThrow({
      where: { id: active.server.id },
    })

    expect(stored.status).toBe("suspended")
    expect(stored.suspendedReason).toBe("admin")
  })

  it("answers not_found for an unknown server and conflict for a revoked one", async () => {
    const { one } = await twoOrganizations()
    const admin = await platformAdmin()
    const revoked = await createServer({
      organizationId: one.organization.id,
      status: "revoked",
    })
    const unknown = await apiRequest<ErrorBody>("/admin/servers/nope/suspend", {
      body: { reason: "Abuse" },
      session: admin,
    })
    const gone = await apiRequest<ErrorBody>(
      `/admin/servers/${revoked.server.id}/suspend`,
      { body: { reason: "Abuse" }, session: admin }
    )

    expect(unknown.status).toBe(404)
    expect(unknown.json.error.code).toBe("not_found")
    expect(gone.status).toBe(409)
    expect(gone.json.error.code).toBe("conflict")
  })

  it("refuses an empty reason, an owner and an anonymous caller", async () => {
    const { one, active } = await twoOrganizations()
    const admin = await platformAdmin()
    const empty = await apiRequest<ErrorBody>(
      `/admin/servers/${active.server.id}/suspend`,
      { body: { reason: "" }, session: admin }
    )
    const owner = await apiRequest<ErrorBody>(
      `/admin/servers/${active.server.id}/suspend`,
      { body: { reason: "Abuse" }, session: one.members[0] }
    )
    const anonymous = await apiRequest<ErrorBody>(
      `/admin/servers/${active.server.id}/suspend`,
      { body: { reason: "Abuse" } }
    )

    expect(empty.status).toBe(422)
    expect(owner.status).toBe(403)
    expect(anonymous.status).toBe(401)
  })
})

describe("GET /admin/servers, tri et fraîcheur", () => {
  let server: ApiTestServer

  beforeAll(async () => {
    server = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  async function threeServers() {
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
      subscription: {},
    })
    const old = await createServer({
      organizationId: organization.id,
      name: "vps-charlie",
    })
    const fresh = await createServer({
      organizationId: organization.id,
      name: "vps-alpha",
    })
    const enrolling = await createServer({
      organizationId: organization.id,
      name: "vps-bravo",
      status: "enrolling",
    })
    const longAgo = new Date(Date.now() - 3 * DAY_MS)

    await server.prisma.server.update({
      where: { id: old.server.id },
      data: { lastHeartbeatAt: longAgo, createdAt: longAgo },
    })
    await server.prisma.server.update({
      where: { id: fresh.server.id },
      data: { lastHeartbeatAt: new Date() },
    })
    await server.prisma.server.update({
      where: { id: enrolling.server.id },
      data: { createdAt: longAgo },
    })

    return { organization, old, fresh, enrolling }
  }

  it("trie par nom, par dernier battement et dans les deux sens", async () => {
    await threeServers()

    const admin = await platformAdmin()
    const byName = await apiRequest<ListBody>(
      "/admin/servers?sort=name&direction=asc",
      { session: admin }
    )
    const byNameDesc = await apiRequest<ListBody>(
      "/admin/servers?sort=name&direction=desc",
      { session: admin }
    )
    const byHeartbeat = await apiRequest<ListBody>(
      "/admin/servers?sort=last_heartbeat_at&direction=desc",
      { session: admin }
    )

    expect(byName.json.data.map((entry) => entry.name)).toEqual([
      "vps-alpha",
      "vps-bravo",
      "vps-charlie",
    ])
    expect(byNameDesc.json.data.map((entry) => entry.name)).toEqual([
      "vps-charlie",
      "vps-bravo",
      "vps-alpha",
    ])
    expect(byHeartbeat.json.data[0]?.name).toBe("vps-alpha")
  })

  it("ne garde que les serveurs sans battement depuis 24 h, et l'inverse", async () => {
    const { old, fresh, enrolling } = await threeServers()
    const admin = await platformAdmin()
    const stale = await apiRequest<ListBody>("/admin/servers?stale=true", {
      session: admin,
    })
    const lively = await apiRequest<ListBody>("/admin/servers?stale=false", {
      session: admin,
    })

    expect(stale.json.data.map((entry) => entry.id)).toEqual([old.server.id])
    expect(stale.json.total).toBe(1)
    expect(stale.json.data[0]?.stale).toBe(true)
    expect(lively.json.data.map((entry) => entry.id).sort()).toEqual(
      [fresh.server.id, enrolling.server.id].sort()
    )
  })

  it("refuse un tri et un sens inconnus", async () => {
    const admin = await platformAdmin()
    const sort = await apiRequest<ErrorBody>("/admin/servers?sort=disk", {
      session: admin,
    })
    const direction = await apiRequest<ErrorBody>(
      "/admin/servers?direction=sideways",
      { session: admin }
    )

    expect(sort.status).toBe(422)
    expect(direction.status).toBe(422)
  })
})

describe("GET /admin/servers/:id", () => {
  let server: ApiTestServer

  beforeAll(async () => {
    server = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("porte l'appareil, les appareils retirés, les alertes, le dernier échantillon et les sept jours", async () => {
    const { one, active } = await twoOrganizations()
    const owner = one.members[0]
    const device = await server.prisma.device.findFirstOrThrow({
      where: { userId: owner.user.id },
    })
    const sample = {
      at: new Date().toISOString(),
      disk: 71,
      ram: 40,
      load: 0.3,
      sessions: [],
      stack_version: null,
      modules: [],
      disk_total_gb: null,
      disk_free_gb: null,
      ram_total_mb: null,
      ram_used_mb: null,
    }
    const expiresAt = new Date(Date.now() + DAY_MS)

    await server.prisma.server.update({
      where: { id: active.server.id },
      data: {
        deviceId: device.id,
        enrollmentExpiresAt: expiresAt,
        pendingAssignmentEmail: "nouvelle@atelier.test",
        lastUsage: sample,
        metrics: { samples: [sample] },
      },
    })
    await server.prisma.alert.create({
      data: { serverId: active.server.id, kind: "disk_high" },
    })
    await server.prisma.serverRevokedDevice.create({
      data: {
        serverId: active.server.id,
        deviceId: device.id,
        revokedByUserId: owner.user.id,
      },
    })

    const admin = await platformAdmin()
    const response = await apiRequest<{ data: AdminServerDetail }>(
      `/admin/servers/${active.server.id}`,
      { session: admin }
    )

    expect(response.status).toBe(200)
    expect(response.json.data.channel).toBe("stable")
    expect(response.json.data.enrollment_expires_at).toBe(
      expiresAt.toISOString()
    )
    expect(response.json.data.pending_assignment_email).toBe(
      "nouvelle@atelier.test"
    )
    expect(response.json.data.device).toMatchObject({
      id: device.id,
      name: "MacBook",
      user: { id: owner.user.id, email: owner.user.email },
    })
    expect(response.json.data.revoked_devices).toHaveLength(1)
    expect(response.json.data.revoked_devices[0]).toMatchObject({
      device: { id: device.id },
      revoked_by: { id: owner.user.id, email: owner.user.email },
    })
    expect(response.json.data.alerts.map((alert) => alert.kind)).toEqual([
      "disk_high",
    ])
    expect(response.json.data.usage?.disk).toBe(71)
    expect(response.json.data.metrics).toHaveLength(1)
    expect(response.json.data.metrics[0]?.disk).toBe(71)
  })
})

describe("PATCH /admin/servers/:id", () => {
  let server: ApiTestServer

  beforeAll(async () => {
    server = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("change le canal, l'écrit au journal avec l'avant et l'après", async () => {
    const { one, active } = await twoOrganizations()
    const admin = await platformAdmin()
    const response = await apiRequest<{ data: AdminServerDetail }>(
      `/admin/servers/${active.server.id}`,
      { method: "PATCH", body: { channel: "beta" }, session: admin }
    )

    expect(response.status).toBe(200)
    expect(response.json.data.channel).toBe("beta")
    expect(
      await server.prisma.server.findUniqueOrThrow({
        where: { id: active.server.id },
      })
    ).toMatchObject({ channel: "beta" })

    const event = await server.prisma.event.findFirstOrThrow({
      where: { action: "server.updated", targetId: active.server.id },
    })

    expect(event.actorUserId).toBe(admin.session.userId)
    expect(event.organizationId).toBe(one.organization.id)
    expect(event.payload).toMatchObject({
      channel: "beta",
      previous_channel: "stable",
    })
  })

  it("n'écrit rien au journal quand le canal ne change pas", async () => {
    const { active } = await twoOrganizations()
    const admin = await platformAdmin()
    const response = await apiRequest<{ data: AdminServerDetail }>(
      `/admin/servers/${active.server.id}`,
      { method: "PATCH", body: { channel: "stable" }, session: admin }
    )

    expect(response.status).toBe(200)
    expect(
      await server.prisma.event.count({ where: { action: "server.updated" } })
    ).toBe(0)
  })

  it("refuse un serveur révoqué, un canal inconnu, un serveur absent, un membre et un anonyme", async () => {
    const { one, active } = await twoOrganizations()
    const admin = await platformAdmin()
    const revoked = await createServer({
      organizationId: one.organization.id,
      status: "revoked",
    })
    const gone = await apiRequest<ErrorBody>(
      `/admin/servers/${revoked.server.id}`,
      { method: "PATCH", body: { channel: "beta" }, session: admin }
    )
    const unknownChannel = await apiRequest<ErrorBody>(
      `/admin/servers/${active.server.id}`,
      { method: "PATCH", body: { channel: "nightly" }, session: admin }
    )
    const missing = await apiRequest<ErrorBody>("/admin/servers/nope", {
      method: "PATCH",
      body: { channel: "beta" },
      session: admin,
    })
    const owner = await apiRequest<ErrorBody>(
      `/admin/servers/${active.server.id}`,
      { method: "PATCH", body: { channel: "beta" }, session: one.members[0] }
    )
    const anonymous = await apiRequest<ErrorBody>(
      `/admin/servers/${active.server.id}`,
      { method: "PATCH", body: { channel: "beta" } }
    )

    expect(gone.status).toBe(409)
    expect(gone.json.error.code).toBe("conflict")
    expect(gone.json.error.fix).toBeString()
    expect(unknownChannel.status).toBe(422)
    expect(missing.status).toBe(404)
    expect(owner.status).toBe(403)
    expect(anonymous.status).toBe(401)
  })
})

describe("DELETE /admin/servers/:id/alerts", () => {
  let server: ApiTestServer

  beforeAll(async () => {
    server = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("ferme les alertes ouvertes, laisse celles déjà fermées et compte au journal", async () => {
    const { one, active } = await twoOrganizations()
    const closed = new Date(Date.now() - DAY_MS)

    await server.prisma.alert.create({
      data: { serverId: active.server.id, kind: "disk_high" },
    })
    await server.prisma.alert.create({
      data: { serverId: active.server.id, kind: "server_unreachable" },
    })
    await server.prisma.alert.create({
      data: {
        serverId: active.server.id,
        kind: "agent_outdated",
        resolvedAt: closed,
      },
    })

    const admin = await platformAdmin()
    const response = await apiRequest(
      `/admin/servers/${active.server.id}/alerts`,
      { method: "DELETE", session: admin }
    )

    expect(response.status).toBe(204)
    expect(
      await server.prisma.alert.count({
        where: { serverId: active.server.id, resolvedAt: null },
      })
    ).toBe(0)
    expect(
      await server.prisma.alert.findFirstOrThrow({
        where: { serverId: active.server.id, kind: "agent_outdated" },
      })
    ).toMatchObject({ resolvedAt: closed })

    const event = await server.prisma.event.findFirstOrThrow({
      where: { action: "server.alerts_cleared", targetId: active.server.id },
    })

    expect(event.actorUserId).toBe(admin.session.userId)
    expect(event.organizationId).toBe(one.organization.id)
    expect(event.payload).toMatchObject({ cleared: 2 })
  })

  it("rend 204 sans rien écrire quand aucune alerte n'est ouverte", async () => {
    const { active } = await twoOrganizations()
    const admin = await platformAdmin()
    const response = await apiRequest(
      `/admin/servers/${active.server.id}/alerts`,
      { method: "DELETE", session: admin }
    )

    expect(response.status).toBe(204)
    expect(
      await server.prisma.event.count({
        where: { action: "server.alerts_cleared" },
      })
    ).toBe(0)
  })

  it("refuse un serveur absent, un membre et un anonyme", async () => {
    const { one, active } = await twoOrganizations()
    const admin = await platformAdmin()
    const missing = await apiRequest<ErrorBody>("/admin/servers/nope/alerts", {
      method: "DELETE",
      session: admin,
    })
    const owner = await apiRequest<ErrorBody>(
      `/admin/servers/${active.server.id}/alerts`,
      { method: "DELETE", session: one.members[0] }
    )
    const anonymous = await apiRequest<ErrorBody>(
      `/admin/servers/${active.server.id}/alerts`,
      { method: "DELETE" }
    )

    expect(missing.status).toBe(404)
    expect(missing.json.error.code).toBe("not_found")
    expect(owner.status).toBe(403)
    expect(anonymous.status).toBe(401)
  })
})
