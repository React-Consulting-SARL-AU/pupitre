import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { joinPlatformOrganization } from "@pupitre/auth/testing"
import { GRANTED_PRODUCT } from "@pupitre/shared/plans"
import { PLATFORM_ORGANIZATION_ID } from "@pupitre/shared/platform"
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

interface OrganizationDetailBody {
  data: {
    id: string
    name: string
    slug: string
    state: string
    reason: string | null
    suspended_reason: string | null
    closed_reason: string | null
    deletion_at: string | null
    members: { user_id: string; role: string }[]
    servers: { id: string; status: string; suspended_reason: string | null }[]
    subscriptions: { id: string; status: string }[]
  }
}

interface MeBody {
  active_organization: { id: string; state: string; reason: string | null }
  organizations: { id: string; state: string }[]
  entitlement: string
}

let harness: ApiTestServer

async function platformAdmin() {
  const { user } = await createUser({
    email: `support-${crypto.randomUUID().slice(0, 8)}@pupitre.studio`,
    role: "platform_admin",
  })

  return await createSession({ userId: user.id })
}

function grantSubscription(organizationId: string) {
  return harness.prisma.subscription.create({
    data: {
      organizationId,
      stripeSubscriptionId: `granted_${organizationId}`,
      product: GRANTED_PRODUCT,
      quantity: 3,
      status: "active",
    },
  })
}

describe("le cycle de vie d'une organisation", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    useFakeBilling()
  })

  it("suspend l'organisation, ses machines, son droit d'usage, et écrit dans le journal du client", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })

    await grantSubscription(organization.id)

    const { server } = await createServer({ organizationId: organization.id })
    const admin = await platformAdmin()
    const sent = harness.sentEmails.length
    const suspended = await apiRequest<OrganizationDetailBody>(
      `/admin/organizations/${organization.id}/suspend`,
      { body: { reason: "abus signalé" }, session: admin }
    )

    expect(suspended.status).toBe(200)
    expect(suspended.json.data.state).toBe("suspended")
    expect(suspended.json.data.suspended_reason).toBe("abus signalé")
    expect(suspended.json.data.servers[0]).toMatchObject({
      id: server.id,
      status: "suspended",
      suspended_reason: "admin",
    })

    const event = await harness.prisma.event.findFirstOrThrow({
      where: { action: "organization.suspended", targetId: organization.id },
    })

    expect(event.organizationId).toBe(organization.id)
    expect(event.payload).toMatchObject({ reason: "abus signalé" })

    expect(harness.sentEmails.length).toBe(sent + 1)
    expect(harness.sentEmails.at(-1)?.to).toBe(members[0].user.email)

    const me = await apiRequest<MeBody>("/me", { session: members[0] })

    expect(me.json.active_organization).toMatchObject({
      state: "suspended",
      reason: "abus signalé",
    })
    expect(me.json.entitlement).toBe("suspended")

    const assign = await apiRequest<ErrorBody>(
      `/servers/${server.id}/unassign`,
      { method: "POST", session: members[0] }
    )

    expect(assign.status).toBe(403)
    expect(assign.json.error.code).toBe("server_suspended")

    const again = await apiRequest<ErrorBody>(
      `/admin/organizations/${organization.id}/suspend`,
      { body: { reason: "deux fois" }, session: admin }
    )

    expect(again.status).toBe(409)
    expect(again.json.error.code).toBe("conflict")
  })

  it("ne rend au rétablissement que les machines que la suspension avait prises", async () => {
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
    })

    await grantSubscription(organization.id)

    const held = await createServer({ organizationId: organization.id })
    const alone = await createServer({ organizationId: organization.id })
    const admin = await platformAdmin()

    await apiRequest(`/admin/servers/${alone.server.id}/suspend`, {
      body: { reason: "machine compromise" },
      session: admin,
    })
    await apiRequest(`/admin/organizations/${organization.id}/suspend`, {
      body: { reason: "abus signalé" },
      session: admin,
    })

    const restored = await apiRequest<OrganizationDetailBody>(
      `/admin/organizations/${organization.id}/restore`,
      { method: "POST", session: admin }
    )

    expect(restored.status).toBe(200)
    expect(restored.json.data.state).toBe("active")

    expect(
      await harness.prisma.server.findUniqueOrThrow({
        where: { id: held.server.id },
      })
    ).toMatchObject({ status: "active", suspendedReason: null })
    expect(
      await harness.prisma.server.findUniqueOrThrow({
        where: { id: alone.server.id },
      })
    ).toMatchObject({ status: "suspended", suspendedReason: "admin" })
  })

  it("ferme l'organisation : entrée refusée, abonnement arrêté, machines suspendues", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const subscription = await grantSubscription(organization.id)

    await createServer({ organizationId: organization.id })

    const admin = await platformAdmin()
    const closed = await apiRequest<OrganizationDetailBody>(
      `/admin/organizations/${organization.id}/close`,
      { body: { reason: "fin de la relation" }, session: admin }
    )

    expect(closed.status).toBe(200)
    expect(closed.json.data.state).toBe("closed")
    expect(closed.json.data.servers[0].status).toBe("suspended")
    expect(
      await harness.prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      })
    ).toMatchObject({ status: "canceled" })
    expect(
      await harness.prisma.event.count({
        where: {
          action: "subscription.canceled",
          organizationId: organization.id,
        },
      })
    ).toBe(1)

    const refused = await apiRequest<ErrorBody>(
      `/orgs/${organization.id}/members`,
      { session: members[0] }
    )

    expect(refused.status).toBe(403)
    expect(refused.json.error.code).toBe("forbidden")
    expect(refused.json.error.fix).toBeString()

    const me = await apiRequest<MeBody>("/me", { session: members[0] })

    expect(
      me.json.organizations.find((row) => row.id === organization.id)?.state
    ).toBe("closed")
    expect(me.json.active_organization).toMatchObject({
      state: "closed",
      reason: "fin de la relation",
    })
  })

  it("rouvre une organisation fermée et annule sa suppression programmée", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })

    await grantSubscription(organization.id)
    await createServer({ organizationId: organization.id })

    const admin = await platformAdmin()
    const scheduled = await apiRequest<OrganizationDetailBody>(
      `/admin/organizations/${organization.id}`,
      { method: "DELETE", body: { reason: "demande RGPD" }, session: admin }
    )

    expect(scheduled.status).toBe(200)
    expect(scheduled.json.data.state).toBe("deleting")
    expect(scheduled.json.data.deletion_at).toBeString()

    const reopened = await apiRequest<OrganizationDetailBody>(
      `/admin/organizations/${organization.id}/reopen`,
      { method: "POST", session: admin }
    )

    expect(reopened.status).toBe(200)
    expect(reopened.json.data.state).toBe("active")
    expect(reopened.json.data.deletion_at).toBeNull()

    const allowed = await apiRequest(`/orgs/${organization.id}/members`, {
      session: members[0],
    })

    expect(allowed.status).toBe(200)
  })

  it("efface l'organisation au second appel, et garde son nom au journal", async () => {
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
    })

    await createServer({ organizationId: organization.id })

    const admin = await platformAdmin()

    await apiRequest(`/admin/organizations/${organization.id}`, {
      method: "DELETE",
      body: { reason: "demande RGPD" },
      session: admin,
    })

    const purged = await apiRequest(`/admin/organizations/${organization.id}`, {
      method: "DELETE",
      body: { reason: "demande RGPD" },
      session: admin,
    })

    expect(purged.status).toBe(204)
    expect(
      await harness.prisma.organization.findUnique({
        where: { id: organization.id },
      })
    ).toBeNull()
    expect(
      await harness.prisma.server.count({
        where: { organizationId: organization.id },
      })
    ).toBe(0)

    const event = await harness.prisma.event.findFirstOrThrow({
      where: { action: "organization.purged", targetId: organization.id },
    })

    expect(event.payload).toEqual({
      name: organization.name,
      slug: organization.slug,
    })
  })

  it("renomme, refuse un slug déjà pris, et garde l'avant et l'après au journal", async () => {
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const other = await createOrganizationWithMembers({ roles: ["owner"] })
    const admin = await platformAdmin()
    const renamed = await apiRequest<OrganizationDetailBody>(
      `/admin/organizations/${organization.id}`,
      {
        method: "PATCH",
        body: { name: "Atelier Ferrand", slug: "Atelier Ferrand" },
        session: admin,
      }
    )

    expect(renamed.status).toBe(200)
    expect(renamed.json.data).toMatchObject({
      name: "Atelier Ferrand",
      slug: "atelier-ferrand",
    })

    const event = await harness.prisma.event.findFirstOrThrow({
      where: { action: "organization.updated", targetId: organization.id },
    })

    expect(event.payload).toMatchObject({
      name: { from: organization.name, to: "Atelier Ferrand" },
    })

    const taken = await apiRequest<ErrorBody>(
      `/admin/organizations/${organization.id}`,
      {
        method: "PATCH",
        body: { slug: other.organization.slug },
        session: admin,
      }
    )

    expect(taken.status).toBe(409)
    expect(taken.json.error.code).toBe("conflict")
  })

  it("transfère la propriété, et refuse un compte qui n'est pas membre", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
    })
    const admin = await platformAdmin()
    const transferred = await apiRequest<OrganizationDetailBody>(
      `/admin/organizations/${organization.id}/transfer`,
      { body: { user_id: members[1].user.id }, session: admin }
    )

    expect(transferred.status).toBe(200)
    expect(transferred.json.data.members).toEqual(
      expect.arrayContaining(
        [
          { user_id: members[1].user.id, role: "owner" },
          { user_id: members[0].user.id, role: "admin" },
        ].map(expect.objectContaining)
      )
    )

    const { user } = await createUser({ email: "dehors@test.local" })
    const refused = await apiRequest<ErrorBody>(
      `/admin/organizations/${organization.id}/transfer`,
      { body: { user_id: user.id }, session: admin }
    )

    expect(refused.status).toBe(404)
  })

  it("retire un membre, libère ses machines, et refuse de retirer le dernier propriétaire", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner", "member"],
    })
    const { server } = await createServer({
      organizationId: organization.id,
      assignedUserId: members[1].user.id,
    })
    const admin = await platformAdmin()
    const removed = await apiRequest(
      `/admin/organizations/${organization.id}/members/${members[1].user.id}`,
      {
        method: "DELETE",
        body: { reason: "demande du client" },
        session: admin,
      }
    )

    expect(removed.status).toBe(204)
    expect(
      await harness.prisma.server.findUniqueOrThrow({
        where: { id: server.id },
      })
    ).toMatchObject({ assignedUserId: null })

    const event = await harness.prisma.event.findFirstOrThrow({
      where: { action: "server.unassigned", targetId: server.id },
    })

    expect(event.payload).toMatchObject({
      by_platform: true,
      reason: "demande du client",
    })

    const refused = await apiRequest<ErrorBody>(
      `/admin/organizations/${organization.id}/members/${members[0].user.id}`,
      { method: "DELETE", body: { reason: "non" }, session: admin }
    )

    expect(refused.status).toBe(409)
    expect(refused.json.error.code).toBe("conflict")
  })

  it("protège l'organisation Pupitre de la suspension, de la fermeture, de l'effacement, du renommage, du transfert et du retrait d'un membre", async () => {
    const admin = await platformAdmin()
    const { user } = await createUser({ email: "equipe-org@pupitre.studio" })

    await joinPlatformOrganization(harness.prisma, user.id, "admin")

    for (const call of [
      apiRequest<ErrorBody>(
        `/admin/organizations/${PLATFORM_ORGANIZATION_ID}/suspend`,
        { body: { reason: "non" }, locale: "fr", session: admin }
      ),
      apiRequest<ErrorBody>(
        `/admin/organizations/${PLATFORM_ORGANIZATION_ID}/close`,
        { body: { reason: "non" }, locale: "fr", session: admin }
      ),
      apiRequest<ErrorBody>(
        `/admin/organizations/${PLATFORM_ORGANIZATION_ID}`,
        {
          method: "DELETE",
          body: { reason: "non" },
          locale: "fr",
          session: admin,
        }
      ),
      apiRequest<ErrorBody>(
        `/admin/organizations/${PLATFORM_ORGANIZATION_ID}`,
        {
          method: "PATCH",
          body: { slug: "pas-pupitre" },
          locale: "fr",
          session: admin,
        }
      ),
      apiRequest<ErrorBody>(
        `/admin/organizations/${PLATFORM_ORGANIZATION_ID}/transfer`,
        { body: { user_id: user.id }, locale: "fr", session: admin }
      ),
      apiRequest<ErrorBody>(
        `/admin/organizations/${PLATFORM_ORGANIZATION_ID}/members/${user.id}`,
        {
          method: "DELETE",
          body: { reason: "non" },
          locale: "fr",
          session: admin,
        }
      ),
    ]) {
      const refused = await call

      expect(refused.status).toBe(409)
      expect(refused.json.error.code).toBe("conflict")
      expect(refused.json.error.message).toContain("ne se renomme")
    }

    expect(
      await harness.prisma.organization.findUniqueOrThrow({
        where: { id: PLATFORM_ORGANIZATION_ID },
      })
    ).not.toMatchObject({ slug: "pas-pupitre" })
    expect(
      await harness.prisma.member.findFirstOrThrow({
        where: { organizationId: PLATFORM_ORGANIZATION_ID, userId: user.id },
      })
    ).toMatchObject({ role: "admin" })
  })

  it("refuse de lever une suspension qui n'existe pas, sans écrire ni prévenir personne", async () => {
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const admin = await platformAdmin()
    const sent = harness.sentEmails.length
    const refused = await apiRequest<ErrorBody>(
      `/admin/organizations/${organization.id}/restore`,
      { method: "POST", session: admin }
    )

    expect(refused.status).toBe(409)
    expect(refused.json.error.code).toBe("conflict")
    expect(harness.sentEmails.length).toBe(sent)
    expect(
      await harness.prisma.event.count({
        where: { action: "organization.restored", targetId: organization.id },
      })
    ).toBe(0)
  })

  it("refuse de rouvrir une organisation qui n'est ni fermée ni en suppression", async () => {
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const admin = await platformAdmin()
    const refused = await apiRequest<ErrorBody>(
      `/admin/organizations/${organization.id}/reopen`,
      { method: "POST", session: admin }
    )

    expect(refused.status).toBe(409)
    expect(refused.json.error.code).toBe("conflict")
    expect(
      await harness.prisma.event.count({
        where: { action: "organization.reopened", targetId: organization.id },
      })
    ).toBe(0)
  })

  it("refuse de fermer une organisation déjà fermée", async () => {
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const admin = await platformAdmin()

    await apiRequest(`/admin/organizations/${organization.id}/close`, {
      body: { reason: "fin de la relation" },
      session: admin,
    })

    const refused = await apiRequest<ErrorBody>(
      `/admin/organizations/${organization.id}/close`,
      { body: { reason: "encore" }, session: admin }
    )

    expect(refused.status).toBe(409)
    expect(refused.json.error.code).toBe("conflict")
    expect(
      await harness.prisma.organization.findUniqueOrThrow({
        where: { id: organization.id },
      })
    ).toMatchObject({ closedReason: "fin de la relation" })
  })

  it("refuse un slug qui ne garde aucun caractère une fois normalisé", async () => {
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const admin = await platformAdmin()
    const refused = await apiRequest<ErrorBody>(
      `/admin/organizations/${organization.id}`,
      { method: "PATCH", body: { slug: "!!!" }, session: admin }
    )

    expect(refused.status).toBe(422)
    expect(refused.json.error.code).toBe("validation")
    expect(
      await harness.prisma.organization.findUniqueOrThrow({
        where: { id: organization.id },
      })
    ).toMatchObject({ slug: organization.slug })
  })

  it("laisse un serveur en cours d'enrôlement où il est, et le rend tel quel", async () => {
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
    })

    await grantSubscription(organization.id)

    const { server } = await createServer({
      organizationId: organization.id,
      status: "enrolling",
    })
    const admin = await platformAdmin()

    await apiRequest(`/admin/organizations/${organization.id}/suspend`, {
      body: { reason: "abus signalé" },
      session: admin,
    })

    expect(
      await harness.prisma.server.findUniqueOrThrow({
        where: { id: server.id },
      })
    ).toMatchObject({ status: "enrolling", suspendedByOrganization: false })

    await apiRequest(`/admin/organizations/${organization.id}/restore`, {
      method: "POST",
      session: admin,
    })

    expect(
      await harness.prisma.server.findUniqueOrThrow({
        where: { id: server.id },
      })
    ).toMatchObject({ status: "enrolling" })
  })

  it("garde suspendu le serveur que l'équipe a pris pendant la suspension de l'organisation", async () => {
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
    })

    await grantSubscription(organization.id)

    const { server } = await createServer({ organizationId: organization.id })
    const admin = await platformAdmin()

    await apiRequest(`/admin/organizations/${organization.id}/suspend`, {
      body: { reason: "abus signalé" },
      session: admin,
    })
    await apiRequest(`/admin/servers/${server.id}/suspend`, {
      body: { reason: "machine compromise" },
      session: admin,
    })
    await apiRequest(`/admin/organizations/${organization.id}/restore`, {
      method: "POST",
      session: admin,
    })

    expect(
      await harness.prisma.server.findUniqueOrThrow({
        where: { id: server.id },
      })
    ).toMatchObject({ status: "suspended", suspendedReason: "admin" })
  })

  it("porte sur la fiche la raison de l'état courant", async () => {
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const admin = await platformAdmin()

    await apiRequest(`/admin/organizations/${organization.id}/suspend`, {
      body: { reason: "abus signalé" },
      session: admin,
    })

    const suspended = await apiRequest<OrganizationDetailBody>(
      `/admin/organizations/${organization.id}`,
      { session: admin }
    )

    expect(suspended.json.data.reason).toBe("abus signalé")

    await apiRequest(`/admin/organizations/${organization.id}/close`, {
      body: { reason: "fin de la relation" },
      session: admin,
    })

    const closed = await apiRequest<OrganizationDetailBody>(
      `/admin/organizations/${organization.id}`,
      { session: admin }
    )

    expect(closed.json.data.reason).toBe("fin de la relation")
  })
})
