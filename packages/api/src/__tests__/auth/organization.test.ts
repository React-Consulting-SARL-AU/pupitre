import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { hasPermission } from "@pupitre/shared/permissions"
import { bootApiTestServer, resetDb, TEST_BASE_URL } from "../../testing"
import { authRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

const DAY_MS = 24 * 60 * 60 * 1000

async function invite(
  organizationId: string,
  email: string,
  role: "admin" | "member",
  headers: Headers
) {
  return await authRequest<{ id: string; role: string; expiresAt: string }>(
    "POST",
    "/organization/invite-member",
    { email, role, organizationId },
    headers
  )
}

async function canInviteMembers(
  organizationId: string,
  headers: Headers
): Promise<boolean> {
  const checked = await authRequest<{ success: boolean }>(
    "POST",
    "/organization/has-permission",
    { organizationId, permissions: { members: ["invite"] } },
    headers
  )

  expect(checked.status).toBe(200)

  return checked.json.success
}

describe("organization invitations", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("gives an accepted member invitation the member role, with shared permissions as the source", async () => {
    const server = await bootApiTestServer()
    const owner = await createUser({ email: "owner@test.local" })
    const ownerSession = await createSession({ userId: owner.user.id })
    const organizationId = owner.organization.id

    const invited = await invite(
      organizationId,
      "guest@test.local",
      "member",
      ownerSession.headers
    )

    expect(invited.status).toBe(200)
    expect(invited.json.role).toBe("member")

    const expiresIn = new Date(invited.json.expiresAt).getTime() - Date.now()

    expect(expiresIn).toBeGreaterThan(7 * DAY_MS - 60_000)
    expect(expiresIn).toBeLessThanOrEqual(7 * DAY_MS)

    expect(server.sentEmails).toHaveLength(1)
    expect(server.sentEmails[0].to).toBe("guest@test.local")
    expect(server.sentEmails[0].text).toContain(
      `${TEST_BASE_URL}/auth/invitation/${invited.json.id}`
    )
    expect(server.sentEmails[0].text).toContain(owner.organization.name)

    const guest = await createUser({ email: "guest@test.local" })
    const guestSession = await createSession({ userId: guest.user.id })

    const accepted = await authRequest<{ member: { role: string } }>(
      "POST",
      "/organization/accept-invitation",
      { invitationId: invited.json.id },
      guestSession.headers
    )

    expect(accepted.status).toBe(200)
    expect(accepted.json.member.role).toBe("member")

    const member = await server.prisma.member.findFirstOrThrow({
      where: { userId: guest.user.id, organizationId },
    })

    expect(member.role).toBe("member")

    expect(await canInviteMembers(organizationId, guestSession.headers)).toBe(
      false
    )
    expect(await canInviteMembers(organizationId, ownerSession.headers)).toBe(
      true
    )
    expect(hasPermission("member", "members:invite")).toBe(false)
    expect(hasPermission("owner", "members:invite")).toBe(true)
    expect(hasPermission("member", "servers:view")).toBe(true)
  })

  it("refuses an invitation sent by a member", async () => {
    const owner = await createUser({ email: "owner@test.local" })
    const ownerSession = await createSession({ userId: owner.user.id })
    const organizationId = owner.organization.id

    const invited = await invite(
      organizationId,
      "guest@test.local",
      "member",
      ownerSession.headers
    )
    const guest = await createUser({ email: "guest@test.local" })
    const guestSession = await createSession({ userId: guest.user.id })

    await authRequest(
      "POST",
      "/organization/accept-invitation",
      { invitationId: invited.json.id },
      guestSession.headers
    )

    const refused = await invite(
      organizationId,
      "third@test.local",
      "member",
      guestSession.headers
    )

    expect(refused.status).toBe(403)
  })

  it("refuses an invitation addressed to someone else", async () => {
    const owner = await createUser({ email: "owner@test.local" })
    const ownerSession = await createSession({ userId: owner.user.id })

    const invited = await invite(
      owner.organization.id,
      "guest@test.local",
      "member",
      ownerSession.headers
    )
    const stranger = await createUser({ email: "stranger@test.local" })
    const strangerSession = await createSession({ userId: stranger.user.id })

    const refused = await authRequest(
      "POST",
      "/organization/accept-invitation",
      { invitationId: invited.json.id },
      strangerSession.headers
    )

    expect(refused.status).toBe(403)
  })
})
