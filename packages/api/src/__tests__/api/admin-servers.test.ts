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

interface ErrorBody {
  error: { code: string; message: string; fix?: string }
}

interface StateBody {
  entitlement: string
  authorized_keys: string[]
}

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
