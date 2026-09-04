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
    expect(me.json.entitlement).toBe("none")

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
    expect(me.entitlement).toBe("none")

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
