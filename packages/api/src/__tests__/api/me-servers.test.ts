import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { authorizedKeysForServer } from "../../lib/servers/authorized-keys"
import { bootApiTestServer, resetDb } from "../../testing"
import {
  createOrganizationWithMembers,
  createServer,
} from "../../testing/factories"
import { ED25519_KEY, SECOND_ED25519_KEY } from "../../testing/keys"
import { apiRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

interface ServerForUserBody {
  id: string
  name: string
  host: string | null
  port: number | null
  user: string | null
  host_fingerprint: string | null
  status: string
  key_ready: boolean
}

type Session = { token: string }

function addDevice(session: Session, name: string, publicKey: string) {
  return apiRequest<{ data: { id: string } }>("/me/devices", {
    body: { name, public_key: publicKey },
    session,
  })
}

function myServers(session: Session) {
  return apiRequest<{ data: ServerForUserBody[] }>("/me/servers", { session })
}

describe("GET /me/servers", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("refuses without a session", async () => {
    const response = await apiRequest("/me/servers")

    expect(response.status).toBe(401)
  })

  it("shows only the servers assigned to the caller", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
    })
    const [owner, member] = members
    const mine = await createServer({
      organizationId: organization.id,
      name: "vps-mien",
      assignedUserId: member.user.id,
    })

    await createServer({
      organizationId: organization.id,
      name: "vps-du-patron",
      assignedUserId: owner.user.id,
    })
    await createServer({
      organizationId: organization.id,
      name: "vps-libre",
    })

    const response = await myServers(member)

    expect(response.status).toBe(200)
    expect(response.json.data).toHaveLength(1)
    expect(response.json.data[0]).toMatchObject({
      id: mine.server.id,
      name: "vps-mien",
      status: "active",
      host_fingerprint: null,
      key_ready: false,
    })
  })

  it("reports key_ready once the user has a device", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["member"],
    })
    const [member] = members

    await createServer({
      organizationId: organization.id,
      assignedUserId: member.user.id,
    })

    expect((await myServers(member)).json.data[0].key_ready).toBe(false)

    await addDevice(member, "MacBook", ED25519_KEY)

    expect((await myServers(member)).json.data[0].key_ready).toBe(true)
  })
})

describe("authorizedKeysForServer", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("is empty for a server without an assigned member", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["member"],
    })
    const [member] = members
    const { server } = await createServer({ organizationId: organization.id })

    await addDevice(member, "MacBook", ED25519_KEY)

    expect(await authorizedKeysForServer(prisma, server.id)).toEqual([])
  })

  it("is empty for an unknown server", async () => {
    const { prisma } = await bootApiTestServer()

    expect(await authorizedKeysForServer(prisma, "nope")).toEqual([])
  })

  it("follows the devices of the assigned member, and only theirs", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
    })
    const [owner, member] = members
    const { server } = await createServer({
      organizationId: organization.id,
      assignedUserId: member.user.id,
    })

    expect(await authorizedKeysForServer(prisma, server.id)).toEqual([])

    const laptop = await addDevice(member, "MacBook", ED25519_KEY)

    await addDevice(owner, "Poste du patron", SECOND_ED25519_KEY)

    expect(await authorizedKeysForServer(prisma, server.id)).toEqual([
      ED25519_KEY,
    ])

    await apiRequest(`/me/devices/${laptop.json.data.id}`, {
      method: "DELETE",
      session: member,
    })

    expect(await authorizedKeysForServer(prisma, server.id)).toEqual([])
  })

  it("stays coherent for every server assigned to the user", async () => {
    const { prisma } = await bootApiTestServer()
    const { user } = await createUser({ email: "nomade@test.local" })
    const session = await createSession({ userId: user.id })
    const first = await createOrganizationWithMembers({ roles: ["owner"] })
    const second = await createOrganizationWithMembers({ roles: ["owner"] })

    for (const { organization } of [first, second]) {
      await prisma.member.create({
        data: {
          id: crypto.randomUUID(),
          organizationId: organization.id,
          userId: user.id,
          role: "member",
          createdAt: new Date(),
        },
      })
    }

    const servers = await Promise.all([
      createServer({
        organizationId: first.organization.id,
        assignedUserId: user.id,
      }),
      createServer({
        organizationId: second.organization.id,
        assignedUserId: user.id,
      }),
    ])
    const laptop = await addDevice(session, "MacBook", ED25519_KEY)

    await addDevice(session, "Fixe", SECOND_ED25519_KEY)

    for (const { server } of servers) {
      const keys = await authorizedKeysForServer(prisma, server.id)

      expect([...keys].sort()).toEqual([ED25519_KEY, SECOND_ED25519_KEY].sort())
    }

    await apiRequest(`/me/devices/${laptop.json.data.id}`, {
      method: "DELETE",
      session,
    })

    for (const { server } of servers) {
      expect(await authorizedKeysForServer(prisma, server.id)).toEqual([
        SECOND_ED25519_KEY,
      ])
    }
  })
})
