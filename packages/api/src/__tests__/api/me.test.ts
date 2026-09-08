import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { ApiError, createApiClient, unwrap } from "../../client"
import { bootApiTestServer, resetDb, TEST_BASE_URL } from "../../testing"
import { createOrganizationWithMembers } from "../../testing/factories"
import { apiRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

interface MeBody {
  user: { id: string; email: string; name: string }
  organizations: { id: string; name: string; slug: string; role: string }[]
  active_organization: { id: string; slug: string } | null
  role: string | null
  entitlement: string
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
        role: "owner",
      },
    ])
    expect(me.json.active_organization).toMatchObject({ id: organization.id })
    expect(me.json.role).toBe("owner")
    expect(me.json.entitlement).toBe("suspended")

    const asOwner = await apiRequest<MeBody>("/me", { session: owner })

    expect(asOwner.json.active_organization).toMatchObject({
      id: shared.organization.id,
      name: "Atelier",
    })
    expect(asOwner.json.organizations).toHaveLength(2)
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
    expect(me.json.entitlement).toBe("none")
  })

  it("mirrors the entitlement of the active organization", async () => {
    const { prisma } = await bootApiTestServer()
    const { user, organization } = await createUser({
      email: "grace@test.local",
    })
    const session = await createSession({ userId: user.id })

    await prisma.subscription.create({
      data: {
        organizationId: organization.id,
        stripeSubscriptionId: "sub_me_entitlement",
        product: "prod_server",
        quantity: 2,
        status: "trialing",
      },
    })

    const inTrial = await apiRequest<MeBody>("/me", { session })

    expect(inTrial.json.entitlement).toBe("valid")

    await prisma.subscription.updateMany({
      where: { organizationId: organization.id },
      data: { status: "past_due" },
    })

    const inGrace = await apiRequest<MeBody>("/me", { session })

    expect(inGrace.json.entitlement).toBe("grace")

    await prisma.subscription.updateMany({
      where: { organizationId: organization.id },
      data: { status: "canceled" },
    })

    const suspended = await apiRequest<MeBody>("/me", { session })

    expect(suspended.json.entitlement).toBe("suspended")
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
    expect(me.entitlement).toBe("suspended")

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
      name: "Flymate",
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
