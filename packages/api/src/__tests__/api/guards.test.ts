import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { ApiErrorBodySchema } from "@pupitre/shared/api/errors"
import { Elysia } from "elysia"
import {
  hasPermission,
  requireAuth,
  requireOrg,
  requirePlatformAdmin,
  requireRole,
  requireServer,
} from "../../lib/api/plugins/guards"
import { createApi } from "../../server"
import { bootApiTestServer, resetDb, TEST_BASE_URL } from "../../testing"
import {
  createOrganizationWithMembers,
  createServer,
} from "../../testing/factories"
import { createSession, createUser } from "../../testing/session"

const guardRoutes = new Elysia()
  .use(
    new Elysia({ prefix: "/auth" })
      .use(requireAuth)
      .get("/", ({ user }) => ({ userId: user.id }))
  )
  .use(
    new Elysia({ prefix: "/org" })
      .use(requireOrg)
      .get("/", ({ organizationId, role }) => ({ organizationId, role }))
  )
  .use(
    new Elysia({ prefix: "/admin-role" })
      .use(requireRole("admin"))
      .get("/", ({ role }) => ({ role }))
  )
  .use(
    new Elysia({ prefix: "/platform" })
      .use(requirePlatformAdmin)
      .get("/", ({ user }) => ({ userId: user.id }))
  )
  .use(
    new Elysia({ prefix: "/agent" })
      .use(requireServer)
      .get("/", ({ currentServer }) => ({
        serverId: currentServer.id,
        status: currentServer.status,
      }))
  )

const api = createApi(guardRoutes)

interface GuardBody {
  error?: { code: string; message: string; fix?: string }
  userId?: string
  organizationId?: string
  role?: string
  serverId?: string
  status?: string
}

async function call(path: string, headers: HeadersInit = {}) {
  const response = await api.handle(
    new Request(`${TEST_BASE_URL}/api/v1${path}`, { headers })
  )

  return { status: response.status, json: (await response.json()) as GuardBody }
}

function bearer(token: string): HeadersInit {
  return { authorization: `Bearer ${token}` }
}

describe("guards", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  describe("requireAuth", () => {
    it("refuses without a session", async () => {
      const response = await call("/auth")

      expect(response.status).toBe(401)
      expect(response.json.error?.code).toBe("unauthenticated")
    })

    it("refuses a forged bearer", async () => {
      const response = await call("/auth", bearer("forged"))

      expect(response.status).toBe(401)
    })

    it("exposes the user with a session", async () => {
      const { user } = await createUser()
      const session = await createSession({ userId: user.id })
      const response = await call("/auth", session.headers)

      expect(response.status).toBe(200)
      expect(response.json).toEqual({ userId: user.id })
    })
  })

  describe("requireOrg", () => {
    it("refuses without a session", async () => {
      const response = await call("/org")

      expect(response.status).toBe(401)
    })

    it("refuses a session without an active organization", async () => {
      const { user } = await createUser()
      const session = await createSession({
        userId: user.id,
        activeOrganizationId: null,
      })
      const response = await call("/org", session.headers)

      expect(response.status).toBe(403)
      expect(response.json.error?.code).toBe("no_active_organization")
      expect(response.json.error?.fix).toBeTruthy()
    })

    it("refuses a session whose active organization the user left", async () => {
      const { organization, members } = await createOrganizationWithMembers({
        roles: ["owner", "member"],
      })
      const [, member] = members
      const { prisma } = await bootApiTestServer()

      await prisma.member.delete({ where: { id: member.member.id } })

      const response = await call("/org", member.headers)

      expect(response.status).toBe(403)
      expect(member.session.activeOrganizationId).toBe(organization.id)
    })

    it("exposes the organization and the member role", async () => {
      const { organization, members } = await createOrganizationWithMembers({
        roles: ["owner", "admin", "member"],
      })
      const [owner, admin, member] = members

      for (const fixture of [owner, admin, member]) {
        const response = await call("/org", fixture.headers)

        expect(response.status).toBe(200)
        expect(response.json).toEqual({
          organizationId: organization.id,
          role: fixture.role,
        })
      }
    })
  })

  describe("requireRole", () => {
    it("ranks owner above admin above member", async () => {
      const { members } = await createOrganizationWithMembers({
        roles: ["owner", "admin", "member"],
      })
      const [owner, admin, member] = members

      expect((await call("/admin-role", owner.headers)).status).toBe(200)
      expect((await call("/admin-role", admin.headers)).status).toBe(200)

      const refused = await call("/admin-role", member.headers)

      expect(refused.status).toBe(403)
      expect(refused.json.error?.code).toBe("forbidden")
    })

    it("refuses without a session", async () => {
      expect((await call("/admin-role")).status).toBe(401)
    })
  })

  describe("requirePlatformAdmin", () => {
    it("refuses a regular user", async () => {
      const { user } = await createUser()
      const session = await createSession({ userId: user.id })
      const response = await call("/platform", session.headers)

      expect(response.status).toBe(403)
      expect(response.json.error?.code).toBe("forbidden")
    })

    it("refuses without a session", async () => {
      expect((await call("/platform")).status).toBe(401)
    })

    it("accepts a platform_admin", async () => {
      const { user } = await createUser({ role: "platform_admin" })
      const session = await createSession({ userId: user.id })
      const response = await call("/platform", session.headers)

      expect(response.status).toBe(200)
      expect(response.json).toEqual({ userId: user.id })
    })
  })

  describe("requireServer", () => {
    it("refuses without a bearer", async () => {
      const response = await call("/agent")

      expect(response.status).toBe(401)
      expect(response.json.error?.code).toBe("unauthenticated")
    })

    it("refuses an unknown server token", async () => {
      const response = await call("/agent", bearer("pupitre_srv_unknown"))

      expect(response.status).toBe(401)
      expect(response.json.error?.code).toBe("invalid_server_token")
    })

    it("refuses a session bearer", async () => {
      const { user } = await createUser()
      const session = await createSession({ userId: user.id })
      const response = await call("/agent", session.headers)

      expect(response.status).toBe(401)
    })

    it("refuses a revoked server", async () => {
      const { organization } = await createOrganizationWithMembers()
      const { token } = await createServer({
        organizationId: organization.id,
        status: "revoked",
      })
      const response = await call("/agent", bearer(token))

      expect(response.status).toBe(401)
      expect(response.json.error?.code).toBe("invalid_server_token")
    })

    it("exposes the server for a valid token, including a suspended one", async () => {
      const { organization } = await createOrganizationWithMembers()
      const active = await createServer({ organizationId: organization.id })
      const suspended = await createServer({
        organizationId: organization.id,
        status: "suspended",
      })
      const { prisma } = await bootApiTestServer()

      expect(
        await prisma.server.count({ where: { serverTokenHash: active.token } })
      ).toBe(0)

      const ok = await call("/agent", bearer(active.token))

      expect(ok.status).toBe(200)
      expect(ok.json).toEqual({ serverId: active.server.id, status: "active" })

      const stillTalking = await call("/agent", bearer(suspended.token))

      expect(stillTalking.status).toBe(200)
      expect(stillTalking.json.status).toBe("suspended")
    })
  })

  it("re-exports hasPermission for fine-grained checks", () => {
    expect(hasPermission("member", "servers:assign")).toBe(false)
    expect(hasPermission("admin", "servers:assign")).toBe(true)
  })

  it("answers every refusal with the single error shape", async () => {
    const { user } = await createUser()
    const noOrg = await createSession({
      userId: user.id,
      activeOrganizationId: null,
    })
    const refusals = await Promise.all([
      call("/auth"),
      call("/org", noOrg.headers),
      call("/admin-role", noOrg.headers),
      call("/platform", noOrg.headers),
      call("/agent"),
      call("/agent", bearer("pupitre_srv_unknown")),
    ])

    for (const refusal of refusals) {
      expect(refusal.status).toBeGreaterThanOrEqual(401)
      expect(ApiErrorBodySchema.safeParse(refusal.json).success).toBe(true)
    }
  })
})
