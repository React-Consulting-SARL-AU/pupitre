import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { bootApiTestServer, resetDb } from "../../testing"
import { authRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

describe("admin plugin", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("refuses admin routes without a session", async () => {
    const listed = await authRequest("GET", "/admin/list-users?limit=10")

    expect(listed.status).toBe(401)
  })

  it("refuses admin routes to a user without platform_admin", async () => {
    const { user } = await createUser({ email: "owner@test.local" })
    const { headers } = await createSession({ userId: user.id })

    expect(user.role).toBe("user")

    const listed = await authRequest(
      "GET",
      "/admin/list-users?limit=10",
      undefined,
      headers
    )

    expect(listed.status).toBe(403)
  })

  it("serves admin routes to platform_admin", async () => {
    await createUser({ email: "someone@test.local" })

    const { user } = await createUser({
      email: "support@pupitre.studio",
      role: "platform_admin",
    })
    const { headers } = await createSession({ userId: user.id })

    const listed = await authRequest<{
      users: { email: string }[]
      total: number
    }>("GET", "/admin/list-users?limit=10", undefined, headers)

    expect(listed.status).toBe(200)
    expect(listed.json.total).toBe(2)
    expect(listed.json.users.map((row) => row.email).sort()).toEqual([
      "someone@test.local",
      "support@pupitre.studio",
    ])
  })
})
