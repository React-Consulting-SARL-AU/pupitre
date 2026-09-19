import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { joinPlatformOrganization } from "@pupitre/auth/testing"
import { LAUNCH_PRODUCT } from "@pupitre/shared/plans"
import { PLATFORM_ORGANIZATION_ID } from "@pupitre/shared/platform"
import { type ApiTestServer, bootApiTestServer, resetDb } from "../../testing"
import { useFakeBilling } from "../../testing/billing"
import {
  createOrganizationWithMembers,
  createServer,
  subscribeOrganization,
} from "../../testing/factories"
import { ED25519_KEY } from "../../testing/keys"
import { apiRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

interface ErrorBody {
  error: { code: string; message: string; fix?: string }
}

interface AdminEvent {
  id: string
  action: string
  target_type: string
  target_id: string
  payload: unknown
  created_at: string
  organization: { id: string; name: string; slug: string } | null
  actor: { id: string; email: string; name: string } | null
}

interface UserDetailBody {
  data: {
    id: string
    email: string
    banned: boolean
    banned_reason: string | null
    ban_expires_at: string | null
    platform_role: string | null
    organizations: { id: string; slug: string }[]
    devices: { id: string; name: string; last_used_at: string | null }[]
    assigned_servers: {
      id: string
      name: string
      host: string | null
      status: string
      organization: { id: string; name: string }
    }[]
    events: AdminEvent[]
  }
}

interface OrganizationsBody {
  data: {
    id: string
    name: string
    slug: string
    personal: boolean
    created_at: string
    members: number
    servers: number
    subscription: {
      status: string
      product: string
      quantity: number
      current_period_end: string | null
    } | null
    referral: { code: string; name: string } | null
  }[]
  total: number
}

interface OrganizationDetailBody {
  data: {
    id: string
    members: { user_id: string; email: string; role: string }[]
    servers: { id: string; organization: { id: string } }[]
    subscriptions: { id: string; status: string; product: string }[]
    events: AdminEvent[]
  }
}

interface ServerDetailBody {
  data: {
    id: string
    status: string
    suspended_reason: string | null
    channel: string
    entitlement_valid_until: string | null
    assigned_user: { id: string; email: string } | null
    device: { id: string; name: string; user: { id: string } } | null
    events: AdminEvent[]
  }
}

interface SubscriptionsBody {
  data: {
    id: string
    status: string
    product: string
    live: boolean
    organization: { id: string; slug: string }
  }[]
  total: number
}

interface EventsBody {
  data: AdminEvent[]
  total: number
}

interface AffiliateDetailBody {
  data: {
    id: string
    code: string
    referrals: number
    organizations: {
      id: string
      slug: string
      subscription_status: string | null
      referred_at: string
    }[]
  }
}

interface ReleasesBody {
  data: {
    version: string
    arch: string
    channel: string
    published_at: string
  }[]
}

interface TeamBody {
  data: { user_id: string; email: string; role: string }[]
}

let harness: ApiTestServer

async function platformAdmin() {
  const { user } = await createUser({
    email: "support@pupitre.studio",
    role: "platform_admin",
  })

  return await createSession({ userId: user.id })
}

describe("GET /admin/users/:id", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("dit les appareils, les serveurs attribués, le rôle plateforme et le journal", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
      subscription: {},
    })
    const [owner] = members
    const { server } = await createServer({
      organizationId: organization.id,
      name: "vps-atelier",
      assignedUserId: owner.user.id,
    })

    await apiRequest("/me/devices", {
      body: { name: "MacBook", public_key: ED25519_KEY },
      session: owner,
    })

    const admin = await platformAdmin()
    const response = await apiRequest<UserDetailBody>(
      `/admin/users/${owner.user.id}`,
      { session: admin }
    )

    expect(response.status).toBe(200)
    expect(response.json.data.email).toBe(owner.user.email)
    expect(response.json.data.platform_role).toBeNull()
    expect(response.json.data.banned).toBe(false)
    expect(response.json.data.banned_reason).toBeNull()
    expect(response.json.data.ban_expires_at).toBeNull()
    expect(response.json.data.devices).toHaveLength(1)
    expect(response.json.data.devices[0].name).toBe("MacBook")
    expect(response.json.data.assigned_servers).toEqual([
      {
        id: server.id,
        name: "vps-atelier",
        host: null,
        status: "active",
        organization: { id: organization.id, name: "Atelier" },
      },
    ])
    expect(response.json.data.events[0]).toMatchObject({
      action: "device.added",
      target_type: "device",
      actor: { id: owner.user.id, email: owner.user.email },
    })
  })

  it("nomme le rôle plateforme d'un membre de l'équipe", async () => {
    const admin = await platformAdmin()
    const response = await apiRequest<UserDetailBody>(
      `/admin/users/${admin.session.userId}`,
      { session: admin }
    )

    expect(response.json.data.platform_role).toBe("owner")
    expect(response.json.data.organizations.map((one) => one.id)).toContain(
      PLATFORM_ORGANIZATION_ID
    )
  })

  it("rend not_found sur un identifiant inconnu", async () => {
    const admin = await platformAdmin()
    const response = await apiRequest<ErrorBody>("/admin/users/inconnu", {
      session: admin,
    })

    expect(response.status).toBe(404)
    expect(response.json.error.code).toBe("not_found")
  })
})

describe("POST /admin/users/:id/ban", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("coupe les sessions et les codes d'appareil, et garde la raison", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const [owner] = members

    await harness.prisma.deviceCode.create({
      data: {
        id: crypto.randomUUID(),
        deviceCode: "device-code",
        userCode: "USER-CODE",
        userId: owner.user.id,
        expiresAt: new Date(Date.now() + 600_000),
        status: "pending",
      },
    })

    const admin = await platformAdmin()
    const response = await apiRequest<UserDetailBody>(
      `/admin/users/${owner.user.id}/ban`,
      { body: { reason: "usage abusif" }, session: admin }
    )

    expect(response.status).toBe(200)
    expect(response.json.data.banned).toBe(true)
    expect(response.json.data.banned_reason).toBe("usage abusif")
    expect(
      await harness.prisma.session.count({ where: { userId: owner.user.id } })
    ).toBe(0)
    expect(
      await harness.prisma.deviceCode.count({
        where: { userId: owner.user.id },
      })
    ).toBe(0)

    const event = await harness.prisma.event.findFirstOrThrow({
      where: { action: "user.banned", targetId: owner.user.id },
    })

    expect(event.targetType).toBe("user")
    expect(event.actorUserId).toBe(admin.session.userId)
    expect(event.payload).toEqual({ reason: "usage abusif" })

    const refused = await apiRequest("/me", { session: owner })

    expect(refused.status).toBe(401)
  })

  it("protège un membre de l'organisation Pupitre", async () => {
    const { user } = await createUser({ email: "equipe@pupitre.studio" })

    await joinPlatformOrganization(harness.prisma, user.id, "member")

    const admin = await platformAdmin()
    const response = await apiRequest<ErrorBody>(
      `/admin/users/${user.id}/ban`,
      { body: { reason: "erreur" }, session: admin }
    )

    expect(response.status).toBe(409)
    expect(response.json.error.code).toBe("conflict")
    expect(response.json.error.fix).toContain("Pupitre")
    expect(
      await harness.prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    ).toMatchObject({ banned: false })
  })

  it("lève le bannissement et garde la ligne du journal", async () => {
    const { user } = await createUser({ email: "client@test.local" })
    const admin = await platformAdmin()

    await apiRequest(`/admin/users/${user.id}/ban`, {
      body: { reason: "usage abusif" },
      session: admin,
    })

    const response = await apiRequest<UserDetailBody>(
      `/admin/users/${user.id}/unban`,
      { method: "POST", session: admin }
    )

    expect(response.status).toBe(200)
    expect(response.json.data.banned).toBe(false)
    expect(response.json.data.banned_reason).toBeNull()
    expect(
      await harness.prisma.event.count({
        where: { action: "user.unbanned", targetId: user.id },
      })
    ).toBe(1)
  })
})

describe("les organisations de la plateforme", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    useFakeBilling()
  })

  it("liste chaque organisation avec ses compteurs, son abonnement et sa provenance", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner", "member"],
    })

    await createServer({ organizationId: organization.id })
    await subscribeOrganization({
      organizationId: organization.id,
      status: "canceled",
    })
    await subscribeOrganization({
      organizationId: organization.id,
      status: "active",
      quantity: 3,
    })

    const link = await harness.prisma.affiliateLink.create({
      data: { code: "blog", name: "Blog", freeMonths: 1 },
    })

    await harness.prisma.referral.create({
      data: { organizationId: organization.id, linkId: link.id },
    })

    const admin = await platformAdmin()
    const response = await apiRequest<OrganizationsBody>(
      "/admin/organizations?q=Atelier",
      { session: admin }
    )

    expect(response.status).toBe(200)
    expect(response.json.total).toBe(1)
    expect(response.json.data[0]).toMatchObject({
      id: organization.id,
      name: "Atelier",
      personal: false,
      members: 2,
      servers: 1,
      subscription: { status: "active", quantity: 3 },
      referral: { code: "blog", name: "Blog" },
    })

    const personal = await apiRequest<OrganizationsBody>(
      `/admin/organizations?q=${encodeURIComponent(members[0].user.email.split("@")[0])}`,
      { session: admin }
    )

    expect(personal.json.data[0]?.personal).toBe(true)
  })

  it("détaille les membres, les serveurs, tous les abonnements et le journal", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })
    const { server } = await createServer({ organizationId: organization.id })

    await subscribeOrganization({
      organizationId: organization.id,
      status: "canceled",
    })
    await harness.prisma.subscription.create({
      data: {
        organizationId: organization.id,
        stripeSubscriptionId: `launch_${organization.id}`,
        product: LAUNCH_PRODUCT,
        quantity: 1,
        status: "trialing",
      },
    })

    const admin = await platformAdmin()

    await apiRequest(`/admin/servers/${server.id}/suspend`, {
      body: { reason: "abus" },
      session: admin,
    })

    const response = await apiRequest<OrganizationDetailBody>(
      `/admin/organizations/${organization.id}`,
      { session: admin }
    )

    expect(response.status).toBe(200)
    expect(response.json.data.members).toEqual([
      expect.objectContaining({
        user_id: members[0].user.id,
        email: members[0].user.email,
        role: "owner",
      }),
    ])
    expect(response.json.data.servers).toHaveLength(1)
    expect(response.json.data.servers[0].organization.id).toBe(organization.id)
    expect(response.json.data.subscriptions).toHaveLength(2)
    expect(response.json.data.events[0]).toMatchObject({
      action: "server.suspended",
      organization: { id: organization.id },
      actor: { id: admin.session.userId },
    })
  })

  it("rend not_found sur une organisation inconnue", async () => {
    const admin = await platformAdmin()
    const response = await apiRequest<ErrorBody>(
      "/admin/organizations/inconnue",
      { session: admin }
    )

    expect(response.status).toBe(404)
    expect(response.json.error.code).toBe("not_found")
  })
})

describe("le détail d'un serveur et sa remise en service", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    useFakeBilling()
  })

  it("dit l'appareil qui a enrôlé, la personne à qui il est attribué et son journal", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
      subscription: {},
    })
    const [owner] = members
    const { server } = await createServer({
      organizationId: organization.id,
      assignedUserId: owner.user.id,
    })
    const device = await harness.prisma.device.create({
      data: {
        userId: owner.user.id,
        name: "MacBook",
        publicKey: ED25519_KEY,
        fingerprint: "SHA256:atelier",
      },
    })

    await harness.prisma.server.update({
      where: { id: server.id },
      data: { deviceId: device.id },
    })

    const admin = await platformAdmin()
    const response = await apiRequest<ServerDetailBody>(
      `/admin/servers/${server.id}`,
      { session: admin }
    )

    expect(response.status).toBe(200)
    expect(response.json.data.channel).toBe("stable")
    expect(response.json.data.assigned_user).toMatchObject({
      id: owner.user.id,
      email: owner.user.email,
    })
    expect(response.json.data.device).toMatchObject({
      id: device.id,
      name: "MacBook",
      user: { id: owner.user.id },
    })
    expect(response.json.data.events).toEqual([])
  })

  it("rend not_found sur un serveur inconnu", async () => {
    const admin = await platformAdmin()
    const response = await apiRequest<ErrorBody>("/admin/servers/inconnu", {
      session: admin,
    })

    expect(response.status).toBe(404)
  })

  it("rend le serveur à son organisation et garde la ligne du journal", async () => {
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
      subscription: {},
    })
    const { server } = await createServer({ organizationId: organization.id })
    const admin = await platformAdmin()

    await apiRequest(`/admin/servers/${server.id}/suspend`, {
      body: { reason: "abus" },
      session: admin,
    })

    const response = await apiRequest<ServerDetailBody>(
      `/admin/servers/${server.id}/restore`,
      { method: "POST", session: admin }
    )

    expect(response.status).toBe(200)
    expect(response.json.data.status).toBe("active")
    expect(response.json.data.suspended_reason).toBeNull()
    expect(response.json.data.entitlement_valid_until).not.toBeNull()
    expect(
      await harness.prisma.event.count({
        where: { action: "server.restored", targetId: server.id },
      })
    ).toBe(1)
  })

  it("laisse un serveur suspendu quand l'organisation n'a plus d'abonnement", async () => {
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const { server } = await createServer({ organizationId: organization.id })
    const admin = await platformAdmin()

    await apiRequest(`/admin/servers/${server.id}/suspend`, {
      body: { reason: "abus" },
      session: admin,
    })

    const response = await apiRequest<ServerDetailBody>(
      `/admin/servers/${server.id}/restore`,
      { method: "POST", session: admin }
    )

    expect(response.status).toBe(200)
    expect(response.json.data.status).toBe("suspended")
    expect(response.json.data.suspended_reason).toBe("billing")
  })

  it("refuse de lever une suspension de facturation", async () => {
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const { server } = await createServer({
      organizationId: organization.id,
      status: "suspended",
    })

    await harness.prisma.server.update({
      where: { id: server.id },
      data: { suspendedReason: "billing" },
    })

    const admin = await platformAdmin()
    const response = await apiRequest<ErrorBody>(
      `/admin/servers/${server.id}/restore`,
      { method: "POST", session: admin, locale: "fr" }
    )

    expect(response.status).toBe(409)
    expect(response.json.error.code).toBe("conflict")
    expect(response.json.error.message).toContain("équipe Pupitre")
    expect(response.json.error.fix).toContain("abonnement")
  })
})

describe("les abonnements, le journal, les liens et l'équipe", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    useFakeBilling()
  })

  it("liste les abonnements en disant lequel compte", async () => {
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })

    await subscribeOrganization({
      organizationId: organization.id,
      status: "canceled",
    })
    await subscribeOrganization({
      organizationId: organization.id,
      status: "active",
    })

    const admin = await platformAdmin()
    const response = await apiRequest<SubscriptionsBody>(
      "/admin/subscriptions",
      { session: admin }
    )

    expect(response.status).toBe(200)
    expect(response.json.total).toBe(2)
    expect(response.json.data[0].organization.id).toBe(organization.id)
    expect(
      response.json.data.filter((subscription) => subscription.live)
    ).toHaveLength(1)
    expect(
      response.json.data.find((subscription) => subscription.live)?.status
    ).toBe("active")

    const filtered = await apiRequest<SubscriptionsBody>(
      "/admin/subscriptions?status=canceled",
      { session: admin }
    )

    expect(filtered.json.total).toBe(1)
    expect(filtered.json.data[0].status).toBe("canceled")
  })

  it("filtre le journal par organisation, acteur, action et cible", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const [owner] = members

    await apiRequest("/me/devices", {
      body: { name: "MacBook", public_key: ED25519_KEY },
      session: owner,
    })

    const { server } = await createServer({ organizationId: organization.id })
    const admin = await platformAdmin()

    await apiRequest(`/admin/servers/${server.id}/suspend`, {
      body: { reason: "abus" },
      session: admin,
    })

    const all = await apiRequest<EventsBody>("/admin/events", {
      session: admin,
    })

    expect(all.status).toBe(200)
    expect(all.json.total).toBe(2)
    expect(all.json.data[0].action).toBe("server.suspended")

    const byOrganization = await apiRequest<EventsBody>(
      `/admin/events?organization_id=${organization.id}`,
      { session: admin }
    )
    const byActor = await apiRequest<EventsBody>(
      `/admin/events?actor_user_id=${owner.user.id}`,
      { session: admin }
    )
    const byAction = await apiRequest<EventsBody>(
      "/admin/events?action=device.added",
      { session: admin }
    )
    const byTarget = await apiRequest<EventsBody>(
      "/admin/events?target_type=server&limit=1",
      { session: admin }
    )

    expect(byOrganization.json.total).toBe(1)
    expect(byActor.json.total).toBe(1)
    expect(byActor.json.data[0].actor?.email).toBe(owner.user.email)
    expect(byAction.json.total).toBe(1)
    expect(byTarget.json.data).toHaveLength(1)
    expect(byTarget.json.data[0].target_id).toBe(server.id)
    expect(byTarget.json.data[0].organization?.id).toBe(organization.id)
  })

  it("détaille un lien d'affiliation et les organisations venues par lui", async () => {
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })
    const link = await harness.prisma.affiliateLink.create({
      data: { code: "blog", name: "Blog", freeMonths: 1 },
    })

    await harness.prisma.referral.create({
      data: { organizationId: organization.id, linkId: link.id },
    })
    await subscribeOrganization({
      organizationId: organization.id,
      status: "active",
    })

    const admin = await platformAdmin()
    const response = await apiRequest<AffiliateDetailBody>(
      `/admin/affiliate-links/${link.id}`,
      { session: admin }
    )

    expect(response.status).toBe(200)
    expect(response.json.data.code).toBe("blog")
    expect(response.json.data.referrals).toBe(1)
    expect(response.json.data.organizations).toHaveLength(1)
    expect(response.json.data.organizations[0]).toMatchObject({
      id: organization.id,
      subscription_status: "active",
    })

    const unknown = await apiRequest<ErrorBody>(
      "/admin/affiliate-links/inconnu",
      { session: admin }
    )

    expect(unknown.status).toBe(404)
  })

  it("liste les versions publiées de l'agent et les membres de l'équipe", async () => {
    await harness.prisma.release.create({
      data: {
        version: "1.2.0",
        arch: "amd64",
        sha256: "a".repeat(64),
        signature: "signature",
        r2Key: "agent/1.2.0/pupitred-amd64",
        channel: "stable",
      },
    })

    const admin = await platformAdmin()
    const releases = await apiRequest<ReleasesBody>("/admin/releases", {
      session: admin,
    })

    expect(releases.status).toBe(200)
    expect(releases.json.data).toHaveLength(1)
    expect(releases.json.data[0]).toMatchObject({
      version: "1.2.0",
      arch: "amd64",
      channel: "stable",
    })

    const team = await apiRequest<TeamBody>("/admin/team", { session: admin })

    expect(team.status).toBe(200)
    expect(team.json.data).toEqual([
      expect.objectContaining({
        user_id: admin.session.userId,
        email: "support@pupitre.studio",
        role: "owner",
      }),
    ])
  })
})
