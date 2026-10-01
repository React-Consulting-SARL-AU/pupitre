import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { type ApiTestServer, bootApiTestServer, resetDb } from "../../testing"
import {
  createOrganizationWithMembers,
  createServer,
} from "../../testing/factories"
import { ED25519_KEY } from "../../testing/keys"
import { apiRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

interface ErrorBody {
  error: { code: string; message: string; fix?: string }
}

interface ServerDetailBody {
  data: {
    id: string
    status: string
    assigned_user: { id: string } | null
    decommission_at: string | null
    events: { action: string; payload: unknown }[]
  }
}

let harness: ApiTestServer

async function platformAdmin() {
  const { user } = await createUser({
    email: "support@pupitre.studio",
    role: "platform_admin",
  })

  return await createSession({ userId: user.id })
}

describe("DELETE /admin/servers/:id", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("revokes first, with the reason in the log, then erases the row on the second call", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const { server } = await createServer({
      organizationId: organization.id,
      assignedUserId: members[0].user.id,
    })
    const admin = await platformAdmin()
    const revoked = await apiRequest<ServerDetailBody>(
      `/admin/servers/${server.id}`,
      {
        method: "DELETE",
        body: { reason: "machine compromise" },
        session: admin,
      }
    )

    expect(revoked.status).toBe(200)
    expect(revoked.json.data).toMatchObject({
      id: server.id,
      status: "revoked",
      assigned_user: null,
    })
    expect(revoked.json.data.decommission_at).toBeString()
    expect(revoked.json.data.events[0]).toMatchObject({
      action: "server.deleted",
      payload: { by_platform: true, reason: "machine compromise" },
    })

    const event = await harness.prisma.event.findFirstOrThrow({
      where: { action: "server.deleted", targetId: server.id },
    })

    expect(event.actorUserId).toBe(admin.session.userId)
    expect(event.organizationId).toBe(organization.id)
    expect(harness.sentEmails.at(-1)?.subject).toContain("sera effacé")

    const purged = await apiRequest(`/admin/servers/${server.id}`, {
      method: "DELETE",
      body: { reason: "machine compromise" },
      session: admin,
    })

    expect(purged.status).toBe(204)
    expect(
      await harness.prisma.server.count({ where: { id: server.id } })
    ).toBe(0)
    expect(
      await harness.prisma.event.findFirstOrThrow({
        where: { action: "server.purged", targetId: server.id },
      })
    ).toMatchObject({
      actorUserId: admin.session.userId,
      payload: { by_platform: true, reason: "machine compromise" },
    })
  })

  it("returns not_found without a row, and requires a reason", async () => {
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const { server } = await createServer({ organizationId: organization.id })
    const admin = await platformAdmin()
    const missing = await apiRequest<ErrorBody>("/admin/servers/nope", {
      method: "DELETE",
      body: { reason: "rien" },
      session: admin,
    })
    const silent = await apiRequest<ErrorBody>(`/admin/servers/${server.id}`, {
      method: "DELETE",
      body: { reason: "" },
      session: admin,
    })

    expect(missing.status).toBe(404)
    expect(missing.json.error.code).toBe("not_found")
    expect(silent.status).toBe(422)
    expect(
      await harness.prisma.server.findUniqueOrThrow({
        where: { id: server.id },
      })
    ).toMatchObject({ status: "active" })
  })

  it("leaves the owner's own removal without a platform mark", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const { server } = await createServer({ organizationId: organization.id })
    const response = await apiRequest(`/servers/${server.id}`, {
      method: "DELETE",
      session: members[0],
    })

    expect(response.status).toBe(204)

    const event = await harness.prisma.event.findFirstOrThrow({
      where: { action: "server.deleted", targetId: server.id },
    })

    expect(event.actorUserId).toBe(members[0].user.id)
    expect(event.payload).toEqual({ host: null, name: server.name })
  })
})

describe("DELETE /admin/users/:id/devices/:deviceId", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("removes the device and signs the team's revocation", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const [owner] = members
    const added = await apiRequest<{ data: { id: string } }>("/me/devices", {
      body: { name: "MacBook", public_key: ED25519_KEY },
      session: owner,
    })
    const deviceId = added.json.data.id
    const admin = await platformAdmin()
    const response = await apiRequest(
      `/admin/users/${owner.user.id}/devices/${deviceId}`,
      { method: "DELETE", body: { reason: "clé exposée" }, session: admin }
    )

    expect(response.status).toBe(204)
    expect(await harness.prisma.device.count({ where: { id: deviceId } })).toBe(
      0
    )

    const event = await harness.prisma.event.findFirstOrThrow({
      where: { action: "device.revoked", targetId: deviceId },
    })

    expect(event.actorUserId).toBe(admin.session.userId)
    expect(event.payload).toMatchObject({
      by_platform: true,
      reason: "clé exposée",
      name: "MacBook",
    })

    const devices = await apiRequest<{ data: unknown[] }>("/me/devices", {
      session: owner,
    })

    expect(devices.json.data).toHaveLength(0)
  })

  it("returns not_found when the device does not belong to this account", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
    })
    const [owner, member] = members
    const added = await apiRequest<{ data: { id: string } }>("/me/devices", {
      body: { name: "MacBook", public_key: ED25519_KEY },
      session: owner,
    })
    const admin = await platformAdmin()
    const response = await apiRequest<ErrorBody>(
      `/admin/users/${member.user.id}/devices/${added.json.data.id}`,
      { method: "DELETE", body: { reason: "erreur" }, session: admin }
    )

    expect(response.status).toBe(404)
    expect(response.json.error.code).toBe("not_found")
    expect(
      await harness.prisma.device.count({ where: { id: added.json.data.id } })
    ).toBe(1)
  })
})
