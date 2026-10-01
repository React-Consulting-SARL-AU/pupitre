import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { joinPlatformOrganization } from "@pupitre/auth/testing"
import { GRANTED_PRODUCT } from "@pupitre/shared/plans"
import { DELETION_GRACE_DAYS } from "@pupitre/shared/platform"
import { type ApiTestServer, bootApiTestServer, resetDb } from "../../testing"
import { useFakeBilling } from "../../testing/billing"
import {
  createOrganizationWithMembers,
  createServer,
} from "../../testing/factories"
import { apiRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

interface ErrorBody {
  error: { code: string; message: string; fix?: string }
}

interface UserDetailBody {
  data: {
    id: string
    state: string
    banned: boolean
    ban_expires_at: string | null
    deactivated_at: string | null
    deactivated_reason: string | null
    deletion_at: string | null
    deletion_reason: string | null
    reason: string | null
    sessions: number
    last_seen_at: string | null
    devices: { id: string }[]
    assigned_servers: { id: string }[]
    events: { action: string; target_id: string }[]
  }
}

const DAY_MS = 86_400_000

let harness: ApiTestServer

async function platformAdmin() {
  const { user } = await createUser({
    email: `support-${crypto.randomUUID().slice(0, 8)}@pupitre.studio`,
    role: "platform_admin",
  })

  return await createSession({ userId: user.id })
}

async function deviceFor(userId: string, name: string) {
  return await harness.prisma.device.create({
    data: {
      userId,
      name,
      publicKey: `ssh-ed25519 AAAA${crypto.randomUUID().replaceAll("-", "")}`,
      fingerprint: `SHA256:${crypto.randomUUID()}`,
    },
  })
}

describe("the lifecycle of an account", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    useFakeBilling()
  })

  it("suspends an account until a date, and makes it active once that date has passed", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
    })
    const target = members[1]
    const admin = await platformAdmin()
    const until = new Date(Date.now() + DAY_MS)
    const banned = await apiRequest<UserDetailBody>(
      `/admin/users/${target.user.id}/ban`,
      {
        body: { reason: "signalement 4412", until: until.toISOString() },
        session: admin,
      }
    )

    expect(banned.status).toBe(200)
    expect(banned.json.data.state).toBe("suspended")
    expect(banned.json.data.ban_expires_at).toBe(until.toISOString())

    const event = await harness.prisma.event.findFirstOrThrow({
      where: { action: "user.banned", targetId: target.user.id },
    })

    expect(event.payload).toEqual({
      reason: "signalement 4412",
      until: until.toISOString(),
    })

    await harness.prisma.user.update({
      where: { id: target.user.id },
      data: { banExpires: new Date(Date.now() - DAY_MS) },
    })

    const lapsed = await apiRequest<UserDetailBody>(
      `/admin/users/${target.user.id}`,
      { session: admin }
    )

    expect(lapsed.json.data.state).toBe("active")
  })

  it("deactivates an account: sessions, devices and assignments are dropped", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
    })
    const target = members[1]
    const device = await deviceFor(target.user.id, "MacBook")
    const { server } = await createServer({
      organizationId: organization.id,
      assignedUserId: target.user.id,
    })
    const admin = await platformAdmin()
    const deactivated = await apiRequest<UserDetailBody>(
      `/admin/users/${target.user.id}/deactivate`,
      { body: { reason: "compte fermé à la demande" }, session: admin }
    )

    expect(deactivated.status).toBe(200)
    expect(deactivated.json.data.state).toBe("deactivated")
    expect(deactivated.json.data.deactivated_reason).toBe(
      "compte fermé à la demande"
    )
    expect(deactivated.json.data.devices).toEqual([])
    expect(deactivated.json.data.assigned_servers).toEqual([])
    expect(deactivated.json.data.sessions).toBe(0)

    expect(
      await harness.prisma.device.findUnique({ where: { id: device.id } })
    ).toBeNull()
    expect(
      await harness.prisma.server.findUniqueOrThrow({
        where: { id: server.id },
      })
    ).toMatchObject({ assignedUserId: null })
    expect(
      await harness.prisma.session.count({ where: { userId: target.user.id } })
    ).toBe(0)

    const again = await apiRequest<ErrorBody>(
      `/admin/users/${target.user.id}/deactivate`,
      { body: { reason: "deux fois" }, locale: "fr", session: admin }
    )

    expect(again.status).toBe(409)
    expect(again.json.error.message).toContain("déjà désactivé")
  })

  it("reactivates an account and cancels its scheduled deletion, without restoring the devices", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
    })
    const target = members[1]

    await deviceFor(target.user.id, "MacBook")

    const admin = await platformAdmin()

    await apiRequest(`/admin/users/${target.user.id}/deactivate`, {
      body: { reason: "fermeture" },
      session: admin,
    })
    await apiRequest(`/admin/users/${target.user.id}`, {
      method: "DELETE",
      body: { reason: "fermeture" },
      session: admin,
    })

    const reactivated = await apiRequest<UserDetailBody>(
      `/admin/users/${target.user.id}/reactivate`,
      { method: "POST", session: admin }
    )

    expect(reactivated.status).toBe(200)
    expect(reactivated.json.data.state).toBe("active")
    expect(reactivated.json.data.deletion_at).toBeNull()
    expect(reactivated.json.data.devices).toEqual([])

    const refused = await apiRequest<ErrorBody>(
      `/admin/users/${target.user.id}/reactivate`,
      { method: "POST", session: admin }
    )

    expect(refused.status).toBe(409)
    expect(refused.json.error.code).toBe("conflict")
  })

  it("schedules the purge in seven days, then erases on the second call", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
    })
    const target = members[1]
    const admin = await platformAdmin()
    const scheduled = await apiRequest<UserDetailBody>(
      `/admin/users/${target.user.id}`,
      { method: "DELETE", body: { reason: "demande RGPD" }, session: admin }
    )

    expect(scheduled.status).toBe(200)
    expect(scheduled.json.data.state).toBe("deleting")

    const deadline = new Date(scheduled.json.data.deletion_at ?? "")

    expect(deadline.getTime() - Date.now()).toBeGreaterThan(
      (DELETION_GRACE_DAYS - 1) * DAY_MS
    )

    const purged = await apiRequest(`/admin/users/${target.user.id}`, {
      method: "DELETE",
      body: { reason: "demande RGPD" },
      session: admin,
    })

    expect(purged.status).toBe(204)
    expect(
      await harness.prisma.user.findUnique({ where: { id: target.user.id } })
    ).toBeNull()

    const events = await harness.prisma.event.findMany({
      where: { targetType: "user", targetId: target.user.id },
    })

    expect(
      events.map((event) => [event.action, event.actorUserId, event.payload])
    ).toEqual([["user.purged", admin.session.userId, null]])
  })

  it("refuses to erase the sole owner of an organization that holds a server", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })

    await createServer({ organizationId: organization.id })

    const admin = await platformAdmin()
    const refused = await apiRequest<ErrorBody>(
      `/admin/users/${members[0].user.id}`,
      { method: "DELETE", body: { reason: "demande RGPD" }, session: admin }
    )

    expect(refused.status).toBe(409)
    expect(refused.json.error.code).toBe("conflict")
    expect(refused.json.error.fix).toContain("transfer")
  })

  it("protects a member of the Pupitre organization from deactivation and purge", async () => {
    const { user } = await createUser({ email: "equipe@pupitre.studio" })

    await joinPlatformOrganization(harness.prisma, user.id, "member")

    const admin = await platformAdmin()

    for (const call of [
      apiRequest<ErrorBody>(`/admin/users/${user.id}/deactivate`, {
        body: { reason: "non" },
        session: admin,
      }),
      apiRequest<ErrorBody>(`/admin/users/${user.id}`, {
        method: "DELETE",
        body: { reason: "non" },
        session: admin,
      }),
    ]) {
      const refused = await call

      expect(refused.status).toBe(409)
      expect(refused.json.error.message).toContain("Pupitre")
    }
  })

  it("revokes all sessions and keeps the row in the log", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
    })
    const target = members[1]
    const admin = await platformAdmin()
    const revoked = await apiRequest(
      `/admin/users/${target.user.id}/sessions/revoke`,
      { method: "POST", session: admin }
    )

    expect(revoked.status).toBe(204)
    expect(
      await harness.prisma.session.count({ where: { userId: target.user.id } })
    ).toBe(0)
    expect(
      await harness.prisma.event.count({
        where: {
          action: "user.sessions_revoked",
          targetId: target.user.id,
        },
      })
    ).toBe(1)
  })

  it("resends the address verification, and refuses on an already verified address", async () => {
    const { user } = await createUser({ email: "aconfirmer@test.local" })

    await harness.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: false },
    })

    const admin = await platformAdmin()
    const sent = harness.sentEmails.length
    const asked = await apiRequest(`/admin/users/${user.id}/verification`, {
      method: "POST",
      session: admin,
    })

    expect(asked.status).toBe(204)
    expect(harness.sentEmails.length).toBe(sent + 1)
    expect(harness.sentEmails.at(-1)?.to).toBe("aconfirmer@test.local")

    await harness.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    })

    const refused = await apiRequest<ErrorBody>(
      `/admin/users/${user.id}/verification`,
      { method: "POST", session: admin }
    )

    expect(refused.status).toBe(409)
    expect(refused.json.error.code).toBe("conflict")
  })

  it("allows erasing the sole owner of an empty organization", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })

    await harness.prisma.subscription.create({
      data: {
        organizationId: organization.id,
        stripeSubscriptionId: "granted_fini",
        product: GRANTED_PRODUCT,
        quantity: 1,
        status: "canceled",
      },
    })

    const admin = await platformAdmin()
    const scheduled = await apiRequest<UserDetailBody>(
      `/admin/users/${members[0].user.id}`,
      { method: "DELETE", body: { reason: "demande RGPD" }, session: admin }
    )

    expect(scheduled.status).toBe(200)
    expect(scheduled.json.data.state).toBe("deleting")
  })

  it("refuses a suspension end date that has already passed", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
    })
    const target = members[1]
    const admin = await platformAdmin()
    const refused = await apiRequest<ErrorBody>(
      `/admin/users/${target.user.id}/ban`,
      {
        body: {
          reason: "signalement 4412",
          until: new Date(Date.now() - DAY_MS).toISOString(),
        },
        session: admin,
      }
    )

    expect(refused.status).toBe(422)
    expect(refused.json.error.code).toBe("validation")
    expect(refused.json.error.fix).toContain("until")
    expect(
      await harness.prisma.user.findUniqueOrThrow({
        where: { id: target.user.id },
      })
    ).toMatchObject({ banned: false, banExpires: null })
  })

  it("shows in the detail the reason for the current state and what the platform did to the account", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
    })
    const target = members[1]
    const admin = await platformAdmin()

    await apiRequest(`/admin/users/${target.user.id}/ban`, {
      body: { reason: "signalement 4412" },
      session: admin,
    })

    const detail = await apiRequest<UserDetailBody>(
      `/admin/users/${target.user.id}`,
      { session: admin }
    )

    expect(detail.json.data.reason).toBe("signalement 4412")
    expect(
      detail.json.data.events.filter(
        (event) =>
          event.action === "user.banned" && event.target_id === target.user.id
      )
    ).toHaveLength(1)
  })

  it("lets a member of the Pupitre organization manage their sessions and devices", async () => {
    const { user } = await createUser({
      email: "equipe-sessions@pupitre.studio",
    })

    await joinPlatformOrganization(harness.prisma, user.id, "member")

    const device = await deviceFor(user.id, "portable de l'équipe")
    const admin = await platformAdmin()

    for (const call of [
      apiRequest<ErrorBody>(`/admin/users/${user.id}/sessions/revoke`, {
        method: "POST",
        session: admin,
      }),
      apiRequest<ErrorBody>(`/admin/users/${user.id}/devices/${device.id}`, {
        method: "DELETE",
        body: { reason: "non" },
        session: admin,
      }),
    ]) {
      const refused = await call

      expect(refused.status).toBe(409)
      expect(refused.json.error.code).toBe("conflict")
      expect(refused.json.error.message).toContain("Pupitre")
    }

    expect(
      await harness.prisma.device.count({ where: { id: device.id } })
    ).toBe(1)
  })

  it("refuses the immediate purge of an account that became sole owner during its grace period", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const admin = await platformAdmin()
    const scheduled = await apiRequest<UserDetailBody>(
      `/admin/users/${members[0].user.id}`,
      { method: "DELETE", body: { reason: "demande RGPD" }, session: admin }
    )

    expect(scheduled.status).toBe(200)
    expect(scheduled.json.data.state).toBe("deleting")

    await createServer({ organizationId: organization.id })

    const refused = await apiRequest<ErrorBody>(
      `/admin/users/${members[0].user.id}`,
      { method: "DELETE", body: { reason: "demande RGPD" }, session: admin }
    )

    expect(refused.status).toBe(409)
    expect(refused.json.error.code).toBe("conflict")
    expect(
      await harness.prisma.user.count({ where: { id: members[0].user.id } })
    ).toBe(1)
  })

  it("refuses each of these actions to a plain team member", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
    })
    const { user } = await createUser({ email: "lecteur@pupitre.studio" })

    await joinPlatformOrganization(harness.prisma, user.id, "member")

    const reader = await createSession({ userId: user.id })
    const refused = await apiRequest<ErrorBody>(
      `/admin/users/${members[1].user.id}/deactivate`,
      { body: { reason: "non" }, session: reader }
    )

    expect(refused.status).toBe(403)
    expect(refused.json.error.code).toBe("forbidden")
  })
})
