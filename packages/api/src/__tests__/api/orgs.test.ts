import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { bootApiTestServer, resetDb } from "../../testing"
import {
  createOrganizationWithMembers,
  createServer,
} from "../../testing/factories"
import { apiRequest } from "../../testing/request"

interface MemberBody {
  id: string
  user_id: string
  email: string
  name: string
  role: string
  created_at: string
}

interface InvitationBody {
  id: string
  email: string
  role: string
  status: string
  expires_at: string
  created_at: string
}

interface MembersBody {
  data: { members: MemberBody[]; invitations: InvitationBody[] }
}

interface EventBody {
  id: string
  action: string
  actor_user_id: string | null
  actor_email: string | null
  target_type: string
  target_id: string
  created_at: string
}

interface EventsBody {
  data: EventBody[]
  total: number
}

interface ErrorBody {
  error: { code: string; message: string; fix?: string }
}

describe("GET /orgs/:id/members", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("refuses without a session", async () => {
    const response = await apiRequest("/orgs/whatever/members")

    expect(response.status).toBe(401)
  })

  it("lists the members and the pending invitations for a plain member", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "admin", "member"],
      subscription: {},
    })
    const [owner, admin, member] = members

    const invited = await apiRequest<{ data: InvitationBody } & ErrorBody>(
      `/orgs/${organization.id}/invitations`,
      { body: { email: "nouvelle@test.local", role: "member" }, session: admin }
    )

    expect(invited.status).toBe(201)

    const response = await apiRequest<MembersBody>(
      `/orgs/${organization.id}/members`,
      { session: member }
    )

    expect(response.status).toBe(200)
    expect(response.json.data.members.map((row) => row.role).sort()).toEqual([
      "admin",
      "member",
      "owner",
    ])
    expect(response.json.data.members.map((row) => row.email)).toContain(
      owner.user.email
    )
    expect(response.json.data.invitations).toHaveLength(1)
    expect(response.json.data.invitations[0].email).toBe("nouvelle@test.local")
    expect(response.json.data.invitations[0].status).toBe("pending")
  })

  it("refuses to read another organization", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const other = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })

    const response = await apiRequest<ErrorBody>(
      `/orgs/${other.organization.id}/members`,
      { session: members[0] }
    )

    expect(response.status).toBe(404)
    expect(response.json.error.code).toBe("not_found")
  })
})

describe("POST /orgs/:id/invitations", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("lets an admin invite someone and sends the invitation email", async () => {
    const server = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "admin"],
      subscription: {},
    })
    const [, admin] = members

    const response = await apiRequest<{ data: InvitationBody }>(
      `/orgs/${organization.id}/invitations`,
      { body: { email: "recrue@test.local", role: "admin" }, session: admin }
    )

    expect(response.status).toBe(201)
    expect(response.json.data.email).toBe("recrue@test.local")
    expect(response.json.data.role).toBe("admin")
    expect(server.sentEmails.map((mail) => mail.to)).toContain(
      "recrue@test.local"
    )
  })

  it("refuses a member", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
      subscription: {},
    })
    const [, member] = members

    const response = await apiRequest<ErrorBody>(
      `/orgs/${organization.id}/invitations`,
      { body: { email: "recrue@test.local", role: "member" }, session: member }
    )

    expect(response.status).toBe(403)
    expect(response.json.error.code).toBe("forbidden")
  })

  it("refuses an unreadable email address", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })

    const response = await apiRequest<ErrorBody>(
      `/orgs/${organization.id}/invitations`,
      { body: { email: "pas-un-email", role: "member" }, session: members[0] }
    )

    expect(response.status).toBe(422)
    expect(response.json.error.code).toBe("validation")
  })

  it("refuses to invite someone who is already a member", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
      subscription: {},
    })
    const [owner, member] = members

    const response = await apiRequest<ErrorBody>(
      `/orgs/${organization.id}/invitations`,
      { body: { email: member.user.email, role: "member" }, session: owner }
    )

    expect(response.status).toBe(409)
    expect(response.json.error.code).toBe("conflict")
    expect(response.json.error.fix).toBeTruthy()
  })
})

describe("GET /orgs/:id/events", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("refuses a member and serves an admin", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "admin", "member"],
      subscription: {},
    })
    const [, admin, member] = members

    expect(
      (await apiRequest(`/orgs/${organization.id}/events`, { session: member }))
        .status
    ).toBe(403)
    expect(
      (await apiRequest(`/orgs/${organization.id}/events`, { session: admin }))
        .status
    ).toBe(200)
  })

  it("pages the audit newest first and carries the actor", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "admin", "member"],
      subscription: {},
    })
    const [, admin, member] = members
    const { server } = await createServer({ organizationId: organization.id })

    await apiRequest(`/servers/${server.id}/assign`, {
      body: { user_id: member.user.id },
      session: admin,
    })
    await apiRequest(`/servers/${server.id}/unassign`, {
      method: "POST",
      session: admin,
    })

    const page = await apiRequest<EventsBody>(
      `/orgs/${organization.id}/events?limit=1`,
      { session: admin }
    )

    expect(page.status).toBe(200)
    expect(page.json.total).toBe(2)
    expect(page.json.data).toHaveLength(1)
    expect(page.json.data[0].action).toBe("server.unassigned")
    expect(page.json.data[0].actor_user_id).toBe(admin.user.id)
    expect(page.json.data[0].actor_email).toBe(admin.user.email)

    const second = await apiRequest<EventsBody>(
      `/orgs/${organization.id}/events?limit=1&offset=1`,
      { session: admin }
    )

    expect(second.json.data[0].action).toBe("server.assigned")
  })

  it("filters on an action and never leaks another organization", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
      subscription: {},
    })
    const [owner, member] = members
    const { server } = await createServer({ organizationId: organization.id })
    const other = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const otherServer = await createServer({
      organizationId: other.organization.id,
    })

    await apiRequest(`/servers/${server.id}/assign`, {
      body: { user_id: member.user.id },
      session: owner,
    })
    await apiRequest(`/servers/${otherServer.server.id}/assign`, {
      body: { user_id: other.members[0].user.id },
      session: other.members[0],
    })

    const filtered = await apiRequest<EventsBody>(
      `/orgs/${organization.id}/events?action=server.assigned`,
      { session: owner }
    )

    expect(filtered.json.total).toBe(1)
    expect(filtered.json.data[0].target_id).toBe(server.id)
  })
})
