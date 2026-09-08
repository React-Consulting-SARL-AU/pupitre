import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { authorizedKeysForServer } from "../../lib/servers/authorized-keys"
import { bootApiTestServer, resetDb } from "../../testing"
import {
  createOrganizationWithMembers,
  createServer,
} from "../../testing/factories"
import { ED25519_KEY, SECOND_ED25519_KEY } from "../../testing/keys"
import { apiRequest, authRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

type Session = { token: string }

interface ServerBody {
  id: string
  assigned_user_id: string | null
  pending_assignment_email: string | null
}

interface AgentStateBody {
  authorized_keys: string[]
}

interface ErrorBody {
  error: { code: string; message: string; fix?: string }
}

function addDevice(session: Session, name: string, publicKey: string) {
  return apiRequest<{ data: { id: string } }>("/me/devices", {
    body: { name, public_key: publicKey },
    session,
  })
}

function agentState(token: string) {
  return apiRequest<AgentStateBody>("/agent/state", { bearer: token })
}

function assign(session: Session, serverId: string, body: unknown) {
  return apiRequest<{ data: ServerBody } & ErrorBody>(
    `/servers/${serverId}/assign`,
    { body, session }
  )
}

describe("POST /servers/:id/assign", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("refuses without a session", async () => {
    const response = await apiRequest("/servers/whatever/assign", {
      body: { user_id: "x" },
    })

    expect(response.status).toBe(401)
  })

  it("refuses an admin whose organization has no subscription", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "admin", "member"],
      subscription: null,
    })
    const [, admin, member] = members
    const { server } = await createServer({ organizationId: organization.id })

    const response = await assign(admin, server.id, {
      user_id: member.user.id,
    })

    expect(response.status).toBe(403)
    expect(response.json.error.code).toBe("entitlement_required")
    expect(response.json.error.fix).toContain("/dashboard/billing")
  })

  it("refuses a member and lets an admin assign", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "admin", "member"],
      subscription: {},
    })
    const [, admin, member] = members
    const { server } = await createServer({ organizationId: organization.id })

    const refused = await assign(member, server.id, {
      user_id: member.user.id,
    })

    expect(refused.status).toBe(403)
    expect(refused.json.error.code).toBe("forbidden")

    const granted = await assign(admin, server.id, { user_id: member.user.id })

    expect(granted.status).toBe(200)
    expect(granted.json.data.assigned_user_id).toBe(member.user.id)
  })

  it("pushes the assigned member's keys into /agent/state right away, and warns the person", async () => {
    const testServer = await bootApiTestServer()
    const { prisma } = testServer
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
      subscription: {},
    })
    const [owner, member] = members
    const { server, token } = await createServer({
      organizationId: organization.id,
    })

    await addDevice(member, "Poste du membre", ED25519_KEY)

    expect((await agentState(token)).json.authorized_keys).toEqual([])

    await assign(owner, server.id, { user_id: member.user.id })

    expect((await agentState(token)).json.authorized_keys).toEqual([
      ED25519_KEY,
    ])
    expect(await authorizedKeysForServer(prisma, server.id)).toEqual([
      ED25519_KEY,
    ])

    const notice = testServer.sentEmails
      .filter((mail) => mail.to === member.user.email)
      .at(-1)

    expect(notice?.subject).toContain(server.name)
    expect(notice?.text).toContain(server.name)
  })

  it("drops the keys when the assigned member leaves the organization", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
      subscription: {},
    })
    const [owner, member] = members
    const { server, token } = await createServer({
      organizationId: organization.id,
    })

    await addDevice(member, "Poste du membre", ED25519_KEY)
    await assign(owner, server.id, { user_id: member.user.id })

    expect((await agentState(token)).json.authorized_keys).toEqual([
      ED25519_KEY,
    ])

    await prisma.member.delete({ where: { id: member.member.id } })

    expect((await agentState(token)).json.authorized_keys).toEqual([])
    expect(await authorizedKeysForServer(prisma, server.id)).toEqual([])
  })

  it("refuses a user who is not a member of the organization", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const stranger = await createUser({ email: "etranger@test.local" })
    const { server } = await createServer({ organizationId: organization.id })

    const response = await assign(members[0], server.id, {
      user_id: stranger.user.id,
    })

    expect(response.status).toBe(404)
    expect(response.json.error.code).toBe("not_found")
    expect(response.json.error.fix).toBeTruthy()
  })

  it("refuses a server of another organization", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const other = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const { server } = await createServer({
      organizationId: other.organization.id,
    })

    const response = await assign(members[0], server.id, {
      user_id: members[0].user.id,
    })

    expect(response.status).toBe(404)
  })

  it("assigns an email that already belongs to a member without inviting again", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
      subscription: {},
    })
    const [owner, member] = members
    const { server } = await createServer({ organizationId: organization.id })

    const response = await assign(owner, server.id, {
      invite_email: member.user.email.toUpperCase(),
    })

    expect(response.status).toBe(200)
    expect(response.json.data.assigned_user_id).toBe(member.user.id)
    expect(response.json.data.pending_assignment_email).toBeNull()
    expect(await prisma.invitation.count()).toBe(0)
  })

  it("invites an unknown email, holds the server, then hands the keys over on acceptance", async () => {
    const testServer = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const [owner] = members
    const { server, token } = await createServer({
      organizationId: organization.id,
    })

    const response = await assign(owner, server.id, {
      invite_email: "recrue@test.local",
    })

    expect(response.status).toBe(200)
    expect(response.json.data.assigned_user_id).toBeNull()
    expect(response.json.data.pending_assignment_email).toBe(
      "recrue@test.local"
    )

    const invitation = await testServer.prisma.invitation.findFirstOrThrow({
      where: { email: "recrue@test.local", organizationId: organization.id },
    })

    expect(invitation.status).toBe("pending")
    expect(testServer.sentEmails.map((mail) => mail.to)).toContain(
      "recrue@test.local"
    )
    expect((await agentState(token)).json.authorized_keys).toEqual([])

    const recruit = await createUser({ email: "recrue@test.local" })
    const recruitSession = await createSession({ userId: recruit.user.id })

    await addDevice(recruitSession, "Poste de la recrue", ED25519_KEY)

    const accepted = await authRequest(
      "POST",
      "/organization/accept-invitation",
      { invitationId: invitation.id },
      recruitSession.headers
    )

    expect(accepted.status).toBe(200)

    const state = await agentState(token)

    expect(state.json.authorized_keys).toEqual([ED25519_KEY])

    const settled = await testServer.prisma.server.findUniqueOrThrow({
      where: { id: server.id },
    })

    expect(settled.assignedUserId).toBe(recruit.user.id)
    expect(settled.pendingAssignmentEmail).toBeNull()
  })
})

describe("POST /servers/:id/unassign", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("drops the keys straight away and writes the actor into the audit", async () => {
    const testServer = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "admin", "member"],
      subscription: {},
    })
    const [, admin, member] = members
    const { server, token } = await createServer({
      organizationId: organization.id,
    })

    await addDevice(member, "Poste du membre", ED25519_KEY)
    await assign(admin, server.id, { user_id: member.user.id })

    expect((await agentState(token)).json.authorized_keys).toEqual([
      ED25519_KEY,
    ])

    const response = await apiRequest<{ data: ServerBody }>(
      `/servers/${server.id}/unassign`,
      { method: "POST", session: admin }
    )

    expect(response.status).toBe(200)
    expect(response.json.data.assigned_user_id).toBeNull()
    expect((await agentState(token)).json.authorized_keys).toEqual([])

    const event = await testServer.prisma.event.findFirstOrThrow({
      where: { action: "server.unassigned", targetId: server.id },
    })

    expect(event.actorUserId).toBe(admin.user.id)
    expect(event.organizationId).toBe(organization.id)
  })

  it("clears a pending invitation assignment too", async () => {
    const testServer = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const { server } = await createServer({ organizationId: organization.id })

    await assign(members[0], server.id, { invite_email: "recrue@test.local" })
    await apiRequest(`/servers/${server.id}/unassign`, {
      method: "POST",
      session: members[0],
    })

    const cleared = await testServer.prisma.server.findUniqueOrThrow({
      where: { id: server.id },
    })

    expect(cleared.pendingAssignmentEmail).toBeNull()
  })

  it("refuses a member", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
      subscription: {},
    })
    const { server } = await createServer({ organizationId: organization.id })

    const response = await apiRequest<ErrorBody>(
      `/servers/${server.id}/unassign`,
      { method: "POST", session: members[1] }
    )

    expect(response.status).toBe(403)
  })
})

describe("POST /servers/:id/revoke-device", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("takes one device out of a server without touching the others", async () => {
    const testServer = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
      subscription: {},
    })
    const [owner, member] = members
    const { server, token } = await createServer({
      organizationId: organization.id,
    })

    const laptop = await addDevice(member, "MacBook", ED25519_KEY)

    await addDevice(member, "Fixe", SECOND_ED25519_KEY)
    await assign(owner, server.id, { user_id: member.user.id })

    expect((await agentState(token)).json.authorized_keys).toEqual([
      ED25519_KEY,
      SECOND_ED25519_KEY,
    ])

    const response = await apiRequest(`/servers/${server.id}/revoke-device`, {
      body: { device_id: laptop.json.data.id },
      session: owner,
    })

    expect(response.status).toBe(204)
    expect((await agentState(token)).json.authorized_keys).toEqual([
      SECOND_ED25519_KEY,
    ])

    const event = await testServer.prisma.event.findFirstOrThrow({
      where: { action: "server.device_revoked", targetId: server.id },
    })

    expect(event.actorUserId).toBe(owner.user.id)
  })

  it("refuses an unknown device and a member", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
      subscription: {},
    })
    const [owner, member] = members
    const { server } = await createServer({ organizationId: organization.id })
    const device = await addDevice(member, "MacBook", ED25519_KEY)

    const unknown = await apiRequest<ErrorBody>(
      `/servers/${server.id}/revoke-device`,
      { body: { device_id: "inexistant" }, session: owner }
    )

    expect(unknown.status).toBe(404)
    expect(unknown.json.error.code).toBe("not_found")

    const refused = await apiRequest(`/servers/${server.id}/revoke-device`, {
      body: { device_id: device.json.data.id },
      session: member,
    })

    expect(refused.status).toBe(403)
  })

  it("refuses a device belonging to another organization", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const { members: strangers } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const { server } = await createServer({ organizationId: organization.id })
    const stranger = await addDevice(strangers[0], "MacBook", ED25519_KEY)

    const response = await apiRequest<ErrorBody>(
      `/servers/${server.id}/revoke-device`,
      { body: { device_id: stranger.json.data.id }, session: members[0] }
    )

    expect(response.status).toBe(404)
    expect(response.json.error.code).toBe("not_found")
  })
})

describe("GET /servers for a member", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("shows a member only their servers, and an admin all of them", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "admin", "member"],
      subscription: {},
    })
    const [, admin, member] = members
    const mine = await createServer({
      organizationId: organization.id,
      name: "vps-du-membre",
    })
    const theirs = await createServer({
      organizationId: organization.id,
      name: "vps-de-l-agence",
    })

    await assign(admin, mine.server.id, { user_id: member.user.id })

    const asMember = await apiRequest<{ data: ServerBody[] }>("/servers", {
      session: member,
    })
    const asAdmin = await apiRequest<{ data: ServerBody[] }>("/servers", {
      session: admin,
    })

    expect(asMember.json.data.map((row) => row.id)).toEqual([mine.server.id])
    expect(asAdmin.json.data.map((row) => row.id).sort()).toEqual(
      [mine.server.id, theirs.server.id].sort()
    )

    const hidden = await apiRequest<ErrorBody>(`/servers/${theirs.server.id}`, {
      session: member,
    })

    expect(hidden.status).toBe(404)
  })
})
