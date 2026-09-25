import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { bootApiTestServer, resetDb } from "../../testing"
import { authRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

interface ErrorBody {
  code?: string
}

async function platformAdminHeaders() {
  const { user } = await createUser({
    email: "support@pupitre.studio",
    role: "platform_admin",
  })
  const { headers } = await createSession({ userId: user.id })

  return headers
}

describe("admin plugin", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("refuses admin routes without a session", async () => {
    const listed = await authRequest("GET", "/admin/list-users?limit=10")

    expect(listed.status).toBe(403)
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

  it("refuses impersonation, password and email changes to platform_admin", async () => {
    const { user: target } = await createUser({ email: "someone@test.local" })
    const headers = await platformAdminHeaders()
    const calls = [
      authRequest<ErrorBody>(
        "POST",
        "/admin/impersonate-user",
        { userId: target.id },
        headers
      ),
      authRequest<ErrorBody>(
        "POST",
        "/admin/set-user-password",
        { userId: target.id, newPassword: "a-new-password-1234" },
        headers
      ),
      authRequest<ErrorBody>(
        "POST",
        "/admin/update-user",
        { userId: target.id, data: { email: "stolen@test.local" } },
        headers
      ),
      authRequest<ErrorBody>(
        "POST",
        "/admin/remove-user",
        { userId: target.id },
        headers
      ),
      authRequest<ErrorBody>(
        "POST",
        "/admin/create-user",
        { email: "new@test.local", name: "new", password: "x" },
        headers
      ),
      authRequest<ErrorBody>(
        "GET",
        "/admin/list-users?limit=10",
        undefined,
        headers
      ),
    ]

    for (const call of calls) {
      const refused = await call

      expect(refused.status).toBe(403)
      expect(refused.json.code).toBe("ADMIN_ENDPOINTS_CLOSED")
    }

    const { prisma } = await bootApiTestServer()
    const untouched = await prisma.user.findUniqueOrThrow({
      where: { id: target.id },
    })

    expect(untouched.email).toBe("someone@test.local")
    expect(await prisma.account.count({ where: { userId: target.id } })).toBe(0)
    expect(
      await prisma.session.count({ where: { impersonatedBy: { not: null } } })
    ).toBe(0)
    expect(
      await prisma.user.count({ where: { email: "new@test.local" } })
    ).toBe(0)
  })
})
