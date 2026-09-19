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
    sessions: number
    last_seen_at: string | null
    devices: { id: string }[]
    assigned_servers: { id: string }[]
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

describe("le cycle de vie d'un compte", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    useFakeBilling()
  })

  it("suspend un compte jusqu'à une date, et le rend actif quand elle est passée", async () => {
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

  it("désactive un compte : sessions, appareils et attributions tombent", async () => {
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

  it("réactive un compte et annule sa suppression programmée, sans rendre les appareils", async () => {
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

  it("programme la purge à sept jours, puis efface au second appel", async () => {
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

    const event = await harness.prisma.event.findFirstOrThrow({
      where: { action: "user.purged", targetId: target.user.id },
    })

    expect(event.payload).toMatchObject({ email: target.user.email })
  })

  it("refuse d'effacer le seul propriétaire d'une organisation qui porte un serveur", async () => {
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

  it("protège un membre de l'organisation Pupitre de la désactivation et de la purge", async () => {
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

  it("révoque toutes les sessions et garde la ligne au journal", async () => {
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

  it("renvoie la vérification d'adresse, et refuse sur une adresse déjà vérifiée", async () => {
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

  it("laisse effacer le seul propriétaire d'une organisation vide", async () => {
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

  it("refuse chacun de ces gestes à un simple membre de l'équipe", async () => {
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
