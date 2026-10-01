import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { joinPlatformOrganization } from "@pupitre/auth/testing"
import { FREE_SERVERS } from "@pupitre/shared/plans"
import { ApiError, createApiClient, unwrap } from "../../client"
import { bootApiTestServer, resetDb, TEST_BASE_URL } from "../../testing"
import {
  createOrganizationWithMembers,
  createServer,
  subscribeOrganization,
} from "../../testing/factories"
import { apiRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

interface MeBody {
  user: { id: string; email: string; name: string }
  organizations: {
    id: string
    name: string
    slug: string
    state: string
    role: string
  }[]
  active_organization: {
    id: string
    slug: string
    state: string
    reason: string | null
  } | null
  role: string | null
  platform_role: string | null
  platform_can_act: boolean
  license: string
  servers: { used: number; limit: number } | null
  license_grant: {
    status: string
    seats: number
    current_period_end: string | null
  } | null
  entitlement: string
  subscription: null
}

describe("GET /me", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("refuses without a session", async () => {
    const response = await apiRequest("/me")

    expect(response.status).toBe(401)
    expect(response.json).toMatchObject({
      error: { code: "unauthenticated" },
    })
  })

  it("describes the user, their organizations, the active one and their role", async () => {
    const { user, organization } = await createUser({
      email: "ada@test.local",
    })
    const shared = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner", "member"],
    })
    const [owner] = shared.members
    const session = await createSession({ userId: user.id })

    const me = await apiRequest<MeBody>("/me", { session })

    expect(me.status).toBe(200)
    expect(me.json.user).toMatchObject({ id: user.id, email: "ada@test.local" })
    expect(me.json.organizations).toEqual([
      {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        state: "active",
        role: "owner",
      },
    ])
    expect(me.json.active_organization).toMatchObject({
      id: organization.id,
      state: "active",
      reason: null,
    })
    expect(me.json.role).toBe("owner")
    expect(me.json.license).toBe("valid")
    expect(me.json.entitlement).toBe("valid")

    const asOwner = await apiRequest<MeBody>("/me", { session: owner })

    expect(asOwner.json.active_organization).toMatchObject({
      id: shared.organization.id,
      name: "Atelier",
    })
    expect(asOwner.json.organizations).toHaveLength(2)
  })

  it("says whether the caller belongs to the platform team", async () => {
    const { user } = await createUser({ email: "ada@test.local" })
    const support = await createUser({
      email: "support@pupitre.studio",
      role: "platform_admin",
    })
    const asUser = await apiRequest<MeBody>("/me", {
      session: await createSession({ userId: user.id }),
    })
    const asSupport = await apiRequest<MeBody>("/me", {
      session: await createSession({ userId: support.user.id }),
    })

    expect(asUser.json.platform_role).toBeNull()
    expect(asSupport.json.platform_role).toBe("owner")
  })

  it("says whether the caller may act on the platform, as the admin guards do", async () => {
    const { prisma } = await bootApiTestServer()
    const { user } = await createUser({ email: "ada@test.local" })
    const reader = await createUser({ email: "lecture@pupitre.studio" })
    const operator = await createUser({ email: "ops@pupitre.studio" })
    const support = await createUser({
      email: "support@pupitre.studio",
      role: "platform_admin",
    })

    await joinPlatformOrganization(prisma, reader.user.id, "member")
    await joinPlatformOrganization(prisma, operator.user.id, "admin")

    const acts = async (userId: string) =>
      (
        await apiRequest<MeBody>("/me", {
          session: await createSession({ userId }),
        })
      ).json.platform_can_act

    expect(await acts(user.id)).toBe(false)
    expect(await acts(reader.user.id)).toBe(false)
    expect(await acts(operator.user.id)).toBe(true)
    expect(await acts(support.user.id)).toBe(true)
  })

  it("reports no active organization and no role for a bare session", async () => {
    const { user } = await createUser()
    const session = await createSession({
      userId: user.id,
      activeOrganizationId: null,
    })
    const me = await apiRequest<MeBody>("/me", { session })

    expect(me.status).toBe(200)
    expect(me.json.active_organization).toBeNull()
    expect(me.json.role).toBeNull()
    expect(me.json.license).toBe("none")
    expect(me.json.servers).toBeNull()
    expect(me.json.license_grant).toBeNull()
  })

  it("mirrors the licence of the active organization, legacy field included", async () => {
    const { prisma } = await bootApiTestServer()
    const { user, organization } = await createUser({
      email: "grace@test.local",
    })
    const session = await createSession({ userId: user.id })

    await prisma.subscription.create({
      data: {
        organizationId: organization.id,
        stripeSubscriptionId: "sub_me_license",
        product: "prod_server",
        quantity: 2,
        status: "past_due",
      },
    })

    const inGrace = await apiRequest<MeBody>("/me", { session })

    expect(inGrace.json.license).toBe("grace")
    expect(inGrace.json.entitlement).toBe("grace")

    await prisma.subscription.updateMany({
      where: { organizationId: organization.id },
      data: { status: "canceled" },
    })

    const free = await apiRequest<MeBody>("/me", { session })

    expect(free.json.license).toBe("valid")

    for (let index = 0; index <= FREE_SERVERS; index += 1) {
      await createServer({ organizationId: organization.id })
    }

    const beyond = await apiRequest<MeBody>("/me", { session })

    expect(beyond.json.license).toBe("suspended")
    expect(beyond.json.entitlement).toBe("suspended")
  })

  it("rend la licence de l'organisation active, ou null sans licence en cours", async () => {
    const { user, organization } = await createUser({
      email: "ada@test.local",
    })
    const session = await createSession({ userId: user.id })

    await createServer({ organizationId: organization.id, status: "active" })
    await createServer({ organizationId: organization.id, status: "revoked" })

    const without = await apiRequest<MeBody>("/me", { session })

    expect(without.json.license_grant).toBeNull()
    expect(without.json.subscription).toBeNull()
    expect(without.json.servers).toEqual({ used: 1, limit: FREE_SERVERS })

    const periodEnd = new Date("2026-12-25T00:00:00.000Z")

    await subscribeOrganization({
      organizationId: organization.id,
      quantity: 2,
      currentPeriodEnd: periodEnd,
    })

    const licensed = await apiRequest<MeBody>("/me", { session })

    expect(licensed.json.license_grant).toEqual({
      status: "active",
      seats: 2,
      current_period_end: periodEnd.toISOString(),
    })
    expect(licensed.json.servers).toEqual({
      used: 1,
      limit: FREE_SERVERS + 2,
    })
    expect(licensed.json.subscription).toBeNull()

    const { prisma } = await bootApiTestServer()

    await prisma.subscription.updateMany({
      where: { organizationId: organization.id },
      data: { status: "canceled" },
    })

    const ended = await apiRequest<MeBody>("/me", { session })

    expect(ended.json.license_grant).toBeNull()
  })

  it("ne compte que les serveurs de l'organisation active", async () => {
    const own = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: { quantity: 3, status: "active" },
    })
    const other = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: { quantity: 1, status: "active" },
    })
    const [owner] = own.members

    await createServer({ organizationId: other.organization.id })

    const me = await apiRequest<MeBody>("/me", { session: owner })

    expect(me.json.servers).toEqual({ used: 0, limit: FREE_SERVERS + 3 })
  })

  it("describes the live licence, not a canceled row touched after it", async () => {
    const periodEnd = new Date("2026-10-25T00:00:00.000Z")
    const own = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {
        quantity: 2,
        status: "past_due",
        currentPeriodEnd: periodEnd,
      },
    })
    const [owner] = own.members
    const { prisma } = await bootApiTestServer()

    await prisma.subscription.create({
      data: {
        organizationId: own.organization.id,
        stripeSubscriptionId: "sub_canceled_after",
        product: "prod_server",
        quantity: 7,
        status: "canceled",
        updatedAt: new Date(Date.now() + 60_000),
      },
    })

    const me = await apiRequest<MeBody>("/me", { session: owner })

    expect(me.json.license_grant).toEqual({
      status: "past_due",
      seats: 2,
      current_period_end: periodEnd.toISOString(),
    })
    expect(me.json.servers).toEqual({ used: 0, limit: FREE_SERVERS + 2 })
  })

  it("is reachable through the typed Eden client", async () => {
    const server = await bootApiTestServer()
    const { user } = await createUser()
    const session = await createSession({ userId: user.id })
    const client = createApiClient(TEST_BASE_URL, {
      fetch: server.fetch,
      headers: { authorization: `Bearer ${session.token}` },
    })

    const me = unwrap(await client.api.v1.me.get())

    expect(me.user.id).toBe(user.id)
    expect(me.license).toBe("valid")

    const anonymous = createApiClient(TEST_BASE_URL, { fetch: server.fetch })

    try {
      unwrap(await anonymous.api.v1.me.get())
      throw new Error("expected an ApiError")
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).status).toBe(401)
    }
  })
})

describe("PATCH /me — l'organisation active", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  async function memberOfTwo() {
    const first = await createOrganizationWithMembers({
      name: "Flyleaf",
      roles: ["owner"],
      subscription: {},
    })
    const [owner] = first.members
    const { prisma } = await bootApiTestServer()

    const second = await prisma.organization.create({
      data: {
        id: crypto.randomUUID(),
        name: "Atelier",
        slug: `atelier-${crypto.randomUUID().slice(0, 8)}`,
        createdAt: new Date(),
      },
    })

    await prisma.member.create({
      data: {
        id: crypto.randomUUID(),
        organizationId: second.id,
        userId: owner.user.id,
        role: "member",
        createdAt: new Date(),
      },
    })

    return { owner, first: first.organization, second }
  }

  it("bascule, et rend aussitôt la nouvelle organisation et son rôle", async () => {
    const { owner, second } = await memberOfTwo()

    const moved = await apiRequest<MeBody>("/me", {
      body: { organization_id: second.id },
      method: "PATCH",
      session: owner,
    })

    expect(moved.status).toBe(200)
    expect(moved.json.active_organization?.id).toBe(second.id)
    expect(moved.json.role).toBe("member")

    const read = await apiRequest<MeBody>("/me", { session: owner })

    expect(read.json.active_organization?.id).toBe(second.id)
    expect(read.json.role).toBe("member")
  })

  it("refuse une organisation dont l'appelant n'est pas membre, sans dire si elle existe", async () => {
    const { owner, first } = await memberOfTwo()
    const stranger = await createOrganizationWithMembers({ roles: ["owner"] })

    const refused = await apiRequest<{ error: { code: string } }>("/me", {
      body: { organization_id: stranger.organization.id },
      method: "PATCH",
      session: owner,
    })

    expect(refused.status).toBe(403)
    expect(refused.json.error.code).toBe("forbidden")

    const unknown = await apiRequest("/me", {
      body: { organization_id: "org-qui-n-existe-pas" },
      method: "PATCH",
      session: owner,
    })

    expect(unknown.status).toBe(403)

    const read = await apiRequest<MeBody>("/me", { session: owner })

    expect(read.json.active_organization?.id).toBe(first.id)
  })

  it("ne touche que la session qui demande", async () => {
    const { owner, second } = await memberOfTwo()
    const elsewhere = await createSession({ userId: owner.user.id })

    const before = await apiRequest<MeBody>("/me", { session: elsewhere })

    await apiRequest("/me", {
      body: { organization_id: second.id },
      method: "PATCH",
      session: owner,
    })

    const after = await apiRequest<MeBody>("/me", { session: elsewhere })

    expect(after.json.active_organization?.id).toBe(
      before.json.active_organization?.id as string
    )
    expect(after.json.active_organization?.id).not.toBe(second.id)
  })

  it("laisse la langue tranquille quand elle n'est pas dite", async () => {
    const { owner, second } = await memberOfTwo()

    await apiRequest("/me", {
      body: { locale: "en" },
      method: "PATCH",
      session: owner,
    })

    const moved = await apiRequest<MeBody & { user: { locale: string } }>(
      "/me",
      {
        body: { organization_id: second.id },
        method: "PATCH",
        session: owner,
      }
    )

    expect(moved.json.user.locale).toBe("en")
  })
})
