import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { GRANTED_PRODUCT, LAUNCH_PRODUCT } from "@pupitre/shared/plans"
import { PLATFORM_ORGANIZATION_ID } from "@pupitre/shared/platform"
import { expireGrantedSubscriptions } from "../../lib/billing/admin"
import type { FakeBilling } from "../../lib/billing/fake"
import { launchSubscriptionId } from "../../lib/billing/launch"
import { type ApiTestServer, bootApiTestServer, resetDb } from "../../testing"
import {
  remoteSubscription,
  useFakeBilling,
  useLaunchBilling,
} from "../../testing/billing"
import {
  createOrganizationWithMembers,
  createServer,
  subscribeOrganization,
} from "../../testing/factories"
import { apiRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

interface ErrorBody {
  error: { code: string; message: string; fix?: string }
}

interface AdminSubscription {
  id: string
  stripe_subscription_id: string
  product: string
  quantity: number
  status: string
  current_period_end: string | null
  cancel_at_period_end: boolean
  note: string | null
  platform: boolean
  live: boolean
  seats: { paid: number; used: number }
  drifted: boolean
  organization: { id: string; name: string; slug: string }
}

interface SubscriptionBody {
  data: AdminSubscription
}

interface SubscriptionDetailBody {
  data: AdminSubscription & {
    stripe_url: string | null
    stripe_events: { id: string; type: string; status: string }[]
    events: { action: string; actor: { id: string } | null; payload: unknown }[]
  }
}

interface SubscriptionsBody {
  data: AdminSubscription[]
  total: number
}

interface MeBody {
  entitlement: string
  subscription: { status: string; servers: { limit: number } } | null
}

const DAY_MS = 86_400_000

let harness: ApiTestServer
let billing: FakeBilling

async function platformAdmin() {
  const { user } = await createUser({
    email: "support@pupitre.studio",
    role: "platform_admin",
  })

  return await createSession({ userId: user.id })
}

async function atelier() {
  const { organization, members } = await createOrganizationWithMembers({
    name: "Atelier",
    roles: ["owner"],
  })

  return { organization, owner: members[0] }
}

function grant(
  organizationId: string,
  session: { token: string },
  body: Record<string, unknown> = { seats: 3 }
) {
  return apiRequest<SubscriptionBody & ErrorBody>(
    `/admin/organizations/${organizationId}/subscriptions`,
    { body, session }
  )
}

describe("POST /admin/organizations/:id/subscriptions", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    billing = useFakeBilling()
  })

  it("accorde un abonnement hors Stripe, ramène les serveurs et garde la note au journal", async () => {
    const { organization, owner } = await atelier()
    const { server } = await createServer({
      organizationId: organization.id,
      status: "suspended",
    })

    await harness.prisma.server.update({
      where: { id: server.id },
      data: { suspendedReason: "billing" },
    })

    const admin = await platformAdmin()
    const endsAt = new Date(Date.now() + 30 * DAY_MS)
    const response = await grant(organization.id, admin, {
      seats: 3,
      ends_at: endsAt.toISOString(),
      note: "Partenaire du lancement",
    })

    expect(response.status).toBe(201)
    expect(response.json.data).toMatchObject({
      product: GRANTED_PRODUCT,
      quantity: 3,
      status: "active",
      current_period_end: endsAt.toISOString(),
      note: "Partenaire du lancement",
      platform: true,
      live: true,
      organization: { id: organization.id, name: "Atelier" },
    })
    expect(response.json.data.stripe_subscription_id).toStartWith("granted_")
    expect(billing.checkouts).toHaveLength(0)

    const event = await harness.prisma.event.findFirstOrThrow({
      where: {
        action: "subscription.granted",
        organizationId: organization.id,
      },
    })

    expect(event.actorUserId).toBe(admin.session.userId)
    expect(event.targetType).toBe("subscription")
    expect(event.targetId).toBe(response.json.data.stripe_subscription_id)
    expect(event.payload).toEqual({
      seats: 3,
      ends_at: endsAt.toISOString(),
      note: "Partenaire du lancement",
    })

    expect(
      await harness.prisma.server.findUniqueOrThrow({
        where: { id: server.id },
      })
    ).toMatchObject({ status: "active", suspendedReason: null })

    const me = await apiRequest<MeBody>("/me", { session: owner })

    expect(me.json.entitlement).toBe("valid")
    expect(me.json.subscription).toMatchObject({
      status: "active",
      servers: { limit: 3 },
    })
  })

  it("accorde sans date de fin ni note", async () => {
    const { organization } = await atelier()
    const admin = await platformAdmin()
    const response = await grant(organization.id, admin, { seats: 1 })

    expect(response.status).toBe(201)
    expect(response.json.data.current_period_end).toBeNull()
    expect(response.json.data.note).toBeNull()
  })

  it("refuse quand l'organisation a déjà un abonnement en cours", async () => {
    const { organization } = await atelier()

    await subscribeOrganization({
      organizationId: organization.id,
      status: "active",
    })

    const admin = await platformAdmin()
    const response = await grant(organization.id, admin)

    expect(response.status).toBe(409)
    expect(response.json.error.code).toBe("conflict")
    expect(response.json.error.fix).toBeString()
    expect(
      await harness.prisma.subscription.count({
        where: { organizationId: organization.id },
      })
    ).toBe(1)
  })

  it("accorde par-dessus un abonnement résilié", async () => {
    const { organization } = await atelier()

    await subscribeOrganization({
      organizationId: organization.id,
      status: "canceled",
    })

    const admin = await platformAdmin()
    const response = await grant(organization.id, admin)

    expect(response.status).toBe(201)
    expect(response.json.data.live).toBe(true)
  })

  it("refuse l'organisation Pupitre, qui n'a besoin de rien", async () => {
    const admin = await platformAdmin()
    const response = await grant(PLATFORM_ORGANIZATION_ID, admin)

    expect(response.status).toBe(409)
    expect(response.json.error.code).toBe("conflict")
    expect(response.json.error.message).toContain("Pupitre")
  })

  it("rend not_found sur une organisation inconnue, et validation sur des sièges hors bornes", async () => {
    const { organization } = await atelier()
    const admin = await platformAdmin()
    const unknown = await grant("inconnue", admin)
    const tooMany = await grant(organization.id, admin, { seats: 501 })
    const none = await grant(organization.id, admin, { seats: 0 })

    expect(unknown.status).toBe(404)
    expect(tooMany.status).toBe(422)
    expect(none.status).toBe(422)
  })
})

describe("GET et PATCH /admin/subscriptions/:id", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    billing = useFakeBilling()
  })

  it("détaille un abonnement avec son organisation et son journal", async () => {
    const { organization } = await atelier()
    const admin = await platformAdmin()
    const granted = await grant(organization.id, admin, { seats: 2 })
    const response = await apiRequest<SubscriptionDetailBody>(
      `/admin/subscriptions/${granted.json.data.id}`,
      { session: admin }
    )

    expect(response.status).toBe(200)
    expect(response.json.data).toMatchObject({
      id: granted.json.data.id,
      product: GRANTED_PRODUCT,
      platform: true,
      live: true,
      organization: { id: organization.id, slug: organization.slug },
    })
    expect(response.json.data.events).toHaveLength(1)
    expect(response.json.data.events[0]).toMatchObject({
      action: "subscription.granted",
      actor: { id: admin.session.userId },
    })

    const missing = await apiRequest<ErrorBody>("/admin/subscriptions/nope", {
      session: admin,
    })

    expect(missing.status).toBe(404)
    expect(missing.json.error.code).toBe("not_found")
  })

  it("liste les abonnements accordés par leur produit, avec note et platform", async () => {
    const { organization } = await atelier()
    const admin = await platformAdmin()

    await grant(organization.id, admin, { seats: 2, note: "Partenaire" })

    const response = await apiRequest<SubscriptionsBody>(
      `/admin/subscriptions?product=${GRANTED_PRODUCT}`,
      { session: admin }
    )

    expect(response.json.total).toBe(1)
    expect(response.json.data[0]).toMatchObject({
      product: GRANTED_PRODUCT,
      note: "Partenaire",
      platform: true,
    })
  })

  it("redimensionne un abonnement accordé et déplace sa fin", async () => {
    const { organization } = await atelier()
    const admin = await platformAdmin()
    const granted = await grant(organization.id, admin, { seats: 2 })
    const endsAt = new Date(Date.now() + 10 * DAY_MS)
    const response = await apiRequest<SubscriptionBody>(
      `/admin/subscriptions/${granted.json.data.id}`,
      {
        method: "PATCH",
        body: { seats: 5, ends_at: endsAt.toISOString() },
        session: admin,
      }
    )

    expect(response.status).toBe(200)
    expect(response.json.data).toMatchObject({
      quantity: 5,
      current_period_end: endsAt.toISOString(),
    })

    const cleared = await apiRequest<SubscriptionBody>(
      `/admin/subscriptions/${granted.json.data.id}`,
      { method: "PATCH", body: { ends_at: null }, session: admin }
    )

    expect(cleared.json.data).toMatchObject({
      quantity: 5,
      current_period_end: null,
    })

    const events = await harness.prisma.event.findMany({
      where: {
        action: "subscription.updated",
        targetId: granted.json.data.stripe_subscription_id,
      },
    })

    expect(events).toHaveLength(2)
    expect(events[0].actorUserId).toBe(admin.session.userId)
    expect(billing.quantities).toHaveLength(0)
  })

  it("refuse de redimensionner sous les serveurs qui occupent un siège", async () => {
    const { organization } = await atelier()
    const admin = await platformAdmin()
    const granted = await grant(organization.id, admin, { seats: 3 })

    await createServer({ organizationId: organization.id })
    await createServer({ organizationId: organization.id })

    const response = await apiRequest<ErrorBody>(
      `/admin/subscriptions/${granted.json.data.id}`,
      { method: "PATCH", body: { seats: 1 }, session: admin, locale: "fr" }
    )

    expect(response.status).toBe(409)
    expect(response.json.error.code).toBe("conflict")
    expect(response.json.error.message).toContain("2")
  })

  it("ne redimensionne qu'un abonnement accordé", async () => {
    const { organization } = await atelier()
    const stripe = await subscribeOrganization({
      organizationId: organization.id,
      status: "active",
    })
    const admin = await platformAdmin()
    const response = await apiRequest<ErrorBody>(
      `/admin/subscriptions/${stripe.id}`,
      { method: "PATCH", body: { seats: 9 }, session: admin }
    )

    expect(response.status).toBe(409)
    expect(response.json.error.code).toBe("conflict")
    expect(response.json.error.fix).toBeString()

    const missing = await apiRequest<ErrorBody>("/admin/subscriptions/nope", {
      method: "PATCH",
      body: { seats: 9 },
      session: admin,
    })

    expect(missing.status).toBe(404)
  })
})

describe("POST /admin/subscriptions/:id/cancel", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    billing = useFakeBilling()
  })

  afterAll(() => {
    useFakeBilling()
  })

  it("arrête un abonnement accordé sur-le-champ et suspend ses serveurs", async () => {
    const { organization, owner } = await atelier()
    const { server } = await createServer({ organizationId: organization.id })
    const admin = await platformAdmin()
    const granted = await grant(organization.id, admin, { seats: 2 })
    const before = Date.now()
    const response = await apiRequest<SubscriptionBody>(
      `/admin/subscriptions/${granted.json.data.id}/cancel`,
      { body: { reason: "fin du partenariat" }, session: admin }
    )

    expect(response.status).toBe(200)
    expect(response.json.data.status).toBe("canceled")
    expect(
      new Date(response.json.data.current_period_end ?? 0).getTime()
    ).toBeGreaterThanOrEqual(before)
    expect(response.json.data.live).toBe(true)

    expect(
      await harness.prisma.server.findUniqueOrThrow({
        where: { id: server.id },
      })
    ).toMatchObject({ status: "suspended", suspendedReason: "billing" })

    const event = await harness.prisma.event.findFirstOrThrow({
      where: {
        action: "subscription.canceled",
        targetId: granted.json.data.stripe_subscription_id,
      },
    })

    expect(event.actorUserId).toBe(admin.session.userId)
    expect(event.payload).toMatchObject({ reason: "fin du partenariat" })

    const me = await apiRequest<MeBody>("/me", { session: owner })

    expect(me.json.entitlement).toBe("suspended")
  })

  it("arrête un abonnement du lancement de la même façon", async () => {
    const { organization } = await atelier()
    const { server } = await createServer({ organizationId: organization.id })
    const launch = await harness.prisma.subscription.create({
      data: {
        organizationId: organization.id,
        stripeSubscriptionId: launchSubscriptionId(organization.id),
        product: LAUNCH_PRODUCT,
        quantity: 1,
        status: "trialing",
        currentPeriodEnd: new Date(Date.now() + 30 * DAY_MS),
      },
    })
    const admin = await platformAdmin()
    const response = await apiRequest<SubscriptionBody>(
      `/admin/subscriptions/${launch.id}/cancel`,
      { body: { reason: "abus" }, session: admin }
    )

    expect(response.status).toBe(200)
    expect(response.json.data.status).toBe("canceled")
    expect(
      await harness.prisma.server.findUniqueOrThrow({
        where: { id: server.id },
      })
    ).toMatchObject({ status: "suspended" })
  })

  it("résilie chez Stripe, reflète la réponse et laisse courir la période payée", async () => {
    const { organization } = await atelier()
    const { server } = await createServer({ organizationId: organization.id })
    const periodEnd = new Date(Date.now() + 12 * DAY_MS)
    const stripe = await subscribeOrganization({
      organizationId: organization.id,
      status: "active",
      quantity: 2,
      currentPeriodEnd: periodEnd,
    })

    billing.put(
      remoteSubscription({
        id: stripe.stripeSubscriptionId,
        organizationId: organization.id,
        quantity: 2,
        currentPeriodEnd: periodEnd,
      })
    )

    const admin = await platformAdmin()
    const response = await apiRequest<SubscriptionBody>(
      `/admin/subscriptions/${stripe.id}/cancel`,
      { body: { reason: "impayé chronique" }, session: admin }
    )

    expect(response.status).toBe(200)
    expect(response.json.data).toMatchObject({
      status: "canceled",
      platform: false,
      current_period_end: periodEnd.toISOString(),
    })
    expect(billing.cancellations).toEqual([stripe.stripeSubscriptionId])

    expect(
      await harness.prisma.server.findUniqueOrThrow({
        where: { id: server.id },
      })
    ).toMatchObject({ status: "grace", entitlementValidUntil: periodEnd })
    expect(
      await harness.prisma.event.count({
        where: {
          action: "subscription.canceled",
          targetId: stripe.stripeSubscriptionId,
          actorUserId: admin.session.userId,
        },
      })
    ).toBe(1)
  })

  it("refuse un abonnement déjà résilié, et rend not_found sans ligne", async () => {
    const { organization } = await atelier()
    const canceled = await subscribeOrganization({
      organizationId: organization.id,
      status: "canceled",
    })
    const admin = await platformAdmin()
    const response = await apiRequest<ErrorBody>(
      `/admin/subscriptions/${canceled.id}/cancel`,
      { body: { reason: "encore" }, session: admin }
    )

    expect(response.status).toBe(409)
    expect(response.json.error.code).toBe("conflict")
    expect(billing.cancellations).toHaveLength(0)

    const missing = await apiRequest<ErrorBody>(
      "/admin/subscriptions/nope/cancel",
      { body: { reason: "rien" }, session: admin }
    )

    expect(missing.status).toBe(404)
  })
})

describe("DELETE /admin/subscriptions/:id", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    billing = useFakeBilling()
  })

  it("efface un abonnement accordé encore en cours, et les serveurs suivent", async () => {
    const { organization, owner } = await atelier()
    const { server } = await createServer({ organizationId: organization.id })
    const admin = await platformAdmin()
    const granted = await grant(organization.id, admin, { seats: 2 })
    const response = await apiRequest(
      `/admin/subscriptions/${granted.json.data.id}`,
      { method: "DELETE", session: admin }
    )

    expect(response.status).toBe(204)
    expect(
      await harness.prisma.subscription.count({
        where: { organizationId: organization.id },
      })
    ).toBe(0)
    expect(
      await harness.prisma.server.findUniqueOrThrow({
        where: { id: server.id },
      })
    ).toMatchObject({ status: "suspended", suspendedReason: "billing" })

    const event = await harness.prisma.event.findFirstOrThrow({
      where: { action: "subscription.deleted" },
    })

    expect(event.actorUserId).toBe(admin.session.userId)
    expect(event.targetId).toBe(granted.json.data.stripe_subscription_id)
    expect(event.organizationId).toBe(organization.id)

    const me = await apiRequest<MeBody>("/me", { session: owner })

    expect(me.json.entitlement).toBe("suspended")
    expect(me.json.subscription).toBeNull()
  })

  it("efface une ligne Stripe résiliée sans toucher aux serveurs que l'abonnement vivant couvre", async () => {
    const { organization } = await atelier()
    const { server } = await createServer({ organizationId: organization.id })
    const old = await subscribeOrganization({
      organizationId: organization.id,
      status: "canceled",
    })

    await subscribeOrganization({
      organizationId: organization.id,
      status: "active",
    })

    const admin = await platformAdmin()
    const response = await apiRequest(`/admin/subscriptions/${old.id}`, {
      method: "DELETE",
      session: admin,
    })

    expect(response.status).toBe(204)
    expect(
      await harness.prisma.server.findUniqueOrThrow({
        where: { id: server.id },
      })
    ).toMatchObject({ status: "active" })
    expect(billing.cancellations).toHaveLength(0)
  })

  it("refuse une ligne Stripe encore vivante : on la résilie d'abord", async () => {
    const { organization } = await atelier()
    const stripe = await subscribeOrganization({
      organizationId: organization.id,
      status: "past_due",
    })
    const admin = await platformAdmin()
    const response = await apiRequest<ErrorBody>(
      `/admin/subscriptions/${stripe.id}`,
      { method: "DELETE", session: admin }
    )

    expect(response.status).toBe(409)
    expect(response.json.error.code).toBe("conflict")
    expect(response.json.error.fix).toBeString()
    expect(
      await harness.prisma.subscription.count({ where: { id: stripe.id } })
    ).toBe(1)

    const missing = await apiRequest<ErrorBody>("/admin/subscriptions/nope", {
      method: "DELETE",
      session: admin,
    })

    expect(missing.status).toBe(404)
  })
})

describe("l'échéance d'un abonnement accordé", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    useFakeBilling()
  })

  it("ferme ce qui est arrivé à échéance et met les serveurs en tolérance à cette date", async () => {
    const { organization } = await atelier()
    const { server } = await createServer({ organizationId: organization.id })
    const admin = await platformAdmin()
    const ended = new Date(Date.now() - DAY_MS)
    const granted = await grant(organization.id, admin, {
      seats: 1,
      ends_at: ended.toISOString(),
    })
    const { organization: other } = await atelier()
    const open = await grant(other.id, admin, {
      seats: 1,
      ends_at: new Date(Date.now() + DAY_MS).toISOString(),
    })
    const { organization: endless } = await atelier()
    const forever = await grant(endless.id, admin, { seats: 1 })

    const now = new Date()

    expect(await expireGrantedSubscriptions(now)).toEqual([
      granted.json.data.id,
    ])
    expect(
      await harness.prisma.subscription.findUniqueOrThrow({
        where: { id: granted.json.data.id },
      })
    ).toMatchObject({ status: "canceled" })
    expect(
      await harness.prisma.subscription.findUniqueOrThrow({
        where: { id: open.json.data.id },
      })
    ).toMatchObject({ status: "active" })
    expect(
      await harness.prisma.subscription.findUniqueOrThrow({
        where: { id: forever.json.data.id },
      })
    ).toMatchObject({ status: "active" })
    expect(
      await harness.prisma.event.count({
        where: {
          action: "subscription.canceled",
          targetId: granted.json.data.stripe_subscription_id,
        },
      })
    ).toBe(1)
    expect(
      await harness.prisma.server.findUniqueOrThrow({
        where: { id: server.id },
      })
    ).toMatchObject({ status: "grace", entitlementValidUntil: ended })
    expect(await expireGrantedSubscriptions(now)).toEqual([])
  })

  it("laisse les serveurs actifs quand un abonnement Stripe compte déjà pour l'organisation", async () => {
    const { organization } = await atelier()
    const { server } = await createServer({ organizationId: organization.id })
    const ended = new Date(Date.now() - DAY_MS)

    await harness.prisma.subscription.create({
      data: {
        organizationId: organization.id,
        stripeSubscriptionId: "granted_ancien",
        product: GRANTED_PRODUCT,
        quantity: 1,
        status: "active",
        currentPeriodEnd: ended,
        updatedAt: ended,
      },
    })
    await subscribeOrganization({
      organizationId: organization.id,
      status: "active",
    })

    const report = await expireGrantedSubscriptions(new Date())

    expect(report).toHaveLength(1)
    expect(
      await harness.prisma.server.findUniqueOrThrow({
        where: { id: server.id },
      })
    ).toMatchObject({ status: "active" })
  })
})

describe("GET /admin/subscriptions, filtres et tris", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    useFakeBilling()
  })

  async function twoOrganizations() {
    const { organization: atelierOrg } = await createOrganizationWithMembers({
      name: "Atelier du Nord",
      roles: ["owner"],
    })
    const { organization: bureau } = await createOrganizationWithMembers({
      name: "Bureau Central",
      roles: ["owner"],
    })
    const counted = await subscribeOrganization({
      organizationId: atelierOrg.id,
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 10 * DAY_MS),
    })
    const dropped = await subscribeOrganization({
      organizationId: atelierOrg.id,
      status: "canceled",
      currentPeriodEnd: new Date(Date.now() - 10 * DAY_MS),
    })
    const other = await subscribeOrganization({
      organizationId: bureau.id,
      status: "trialing",
    })

    return { atelierOrg, bureau, counted, dropped, other }
  }

  it("filtre par organisation", async () => {
    const { bureau, other } = await twoOrganizations()
    const admin = await platformAdmin()
    const response = await apiRequest<SubscriptionsBody>(
      `/admin/subscriptions?organization_id=${bureau.id}`,
      { session: admin }
    )

    expect(response.json.total).toBe(1)
    expect(response.json.data.map((row) => row.id)).toEqual([other.id])
  })

  it("garde ou écarte celui qui compte pour son organisation", async () => {
    const { counted, dropped, other } = await twoOrganizations()
    const admin = await platformAdmin()
    const live = await apiRequest<SubscriptionsBody>(
      "/admin/subscriptions?live=true",
      { session: admin }
    )
    const past = await apiRequest<SubscriptionsBody>(
      "/admin/subscriptions?live=false",
      { session: admin }
    )

    expect(live.json.total).toBe(2)
    expect(live.json.data.map((row) => row.id).sort()).toEqual(
      [counted.id, other.id].sort()
    )
    expect(past.json.total).toBe(1)
    expect(past.json.data.map((row) => row.id)).toEqual([dropped.id])
  })

  it("cherche par nom, par slug et par identifiant Stripe", async () => {
    const { bureau, other } = await twoOrganizations()
    const admin = await platformAdmin()
    const byName = await apiRequest<SubscriptionsBody>(
      "/admin/subscriptions?q=Bureau",
      { session: admin }
    )
    const bySlug = await apiRequest<SubscriptionsBody>(
      `/admin/subscriptions?q=${bureau.slug}`,
      { session: admin }
    )
    const byStripeId = await apiRequest<SubscriptionsBody>(
      `/admin/subscriptions?q=${other.stripeSubscriptionId}`,
      { session: admin }
    )
    const nothing = await apiRequest<SubscriptionsBody>(
      "/admin/subscriptions?q=introuvable",
      { session: admin }
    )

    expect(byName.json.data.map((row) => row.id)).toEqual([other.id])
    expect(bySlug.json.data.map((row) => row.id)).toEqual([other.id])
    expect(byStripeId.json.data.map((row) => row.id)).toEqual([other.id])
    expect(nothing.json).toEqual({ data: [], total: 0 })
  })

  it("porte les sièges payés, les sièges occupés et la dérive sur chaque ligne", async () => {
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier serré",
      roles: ["owner"],
    })
    const tight = await subscribeOrganization({
      organizationId: organization.id,
      status: "active",
      quantity: 1,
    })
    const { other } = await twoOrganizations()
    const admin = await platformAdmin()

    await createServer({ organizationId: organization.id })
    await createServer({ organizationId: organization.id, status: "grace" })
    await createServer({ organizationId: organization.id, status: "revoked" })

    const response = await apiRequest<SubscriptionsBody>(
      "/admin/subscriptions",
      { session: admin }
    )
    const byId = new Map(response.json.data.map((row) => [row.id, row]))

    expect(byId.get(tight.id)?.seats).toEqual({ paid: 1, used: 2 })
    expect(byId.get(tight.id)?.drifted).toBe(true)
    expect(byId.get(other.id)?.seats.used).toBe(0)
    expect(byId.get(other.id)?.drifted).toBe(false)
  })

  it("trie par fin de période dans les deux sens, et refuse un tri inconnu", async () => {
    const { counted, dropped } = await twoOrganizations()
    const admin = await platformAdmin()
    const ascending = await apiRequest<SubscriptionsBody>(
      "/admin/subscriptions?sort=current_period_end&direction=asc",
      { session: admin }
    )
    const descending = await apiRequest<SubscriptionsBody>(
      "/admin/subscriptions?sort=current_period_end&direction=desc",
      { session: admin }
    )
    const unknown = await apiRequest<ErrorBody>(
      "/admin/subscriptions?sort=seats",
      { session: admin }
    )

    expect(ascending.json.data.at(-1)?.id).toBe(counted.id)
    expect(descending.json.data[0]?.id).toBe(counted.id)
    expect(dropped.id).toBeString()
    expect(unknown.status).toBe(422)
  })
})

describe("GET /admin/subscriptions/:id, sièges, dérive et Stripe", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    useFakeBilling()
  })

  it("compte les sièges occupés, signale la dérive et pointe le tableau de bord Stripe", async () => {
    const { organization } = await atelier()
    const stripe = await subscribeOrganization({
      organizationId: organization.id,
      status: "active",
      quantity: 1,
    })

    await createServer({ organizationId: organization.id })
    await createServer({ organizationId: organization.id, status: "grace" })
    await createServer({ organizationId: organization.id, status: "revoked" })
    await harness.prisma.stripeEvent.createMany({
      data: [
        {
          id: "evt_detail_1",
          type: "customer.subscription.updated",
          status: "processed",
          subscriptionId: stripe.stripeSubscriptionId,
          receivedAt: new Date(Date.now() - DAY_MS),
        },
        {
          id: "evt_detail_2",
          type: "invoice.payment_failed",
          status: "failed",
          subscriptionId: stripe.stripeSubscriptionId,
          receivedAt: new Date(),
        },
        {
          id: "evt_detail_ailleurs",
          type: "customer.subscription.updated",
          status: "processed",
          subscriptionId: "sub_autre",
        },
      ],
    })

    const admin = await platformAdmin()
    const response = await apiRequest<SubscriptionDetailBody>(
      `/admin/subscriptions/${stripe.id}`,
      { session: admin }
    )

    expect(response.status).toBe(200)
    expect(response.json.data.seats).toEqual({ paid: 1, used: 2 })
    expect(response.json.data.drifted).toBe(true)
    expect(response.json.data.stripe_url).toContain(
      `/subscriptions/${stripe.stripeSubscriptionId}`
    )
    expect(response.json.data.stripe_events.map((event) => event.id)).toEqual([
      "evt_detail_2",
      "evt_detail_1",
    ])
    expect(response.json.data.stripe_events[0]?.status).toBe("failed")
  })

  it("ne dérive pas quand les sièges couvrent, et n'a pas d'adresse Stripe sur un produit de la plateforme", async () => {
    const { organization } = await atelier()
    const admin = await platformAdmin()
    const granted = await grant(organization.id, admin, { seats: 3 })

    await createServer({ organizationId: organization.id })

    const response = await apiRequest<SubscriptionDetailBody>(
      `/admin/subscriptions/${granted.json.data.id}`,
      { session: admin }
    )

    expect(response.json.data.seats).toEqual({ paid: 3, used: 1 })
    expect(response.json.data.drifted).toBe(false)
    expect(response.json.data.stripe_url).toBeNull()
    expect(response.json.data.stripe_events).toEqual([])
  })
})

describe("POST /admin/subscriptions/:id/trial", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    billing = useFakeBilling()
  })

  afterAll(() => {
    useFakeBilling()
  })

  async function trialing() {
    const { organization } = await atelier()
    const endsAt = new Date(Date.now() + 5 * DAY_MS)
    const stripe = await subscribeOrganization({
      organizationId: organization.id,
      status: "trialing",
      quantity: 2,
      currentPeriodEnd: endsAt,
    })

    billing.put(
      remoteSubscription({
        id: stripe.stripeSubscriptionId,
        organizationId: organization.id,
        status: "trialing",
        quantity: 2,
        currentPeriodEnd: endsAt,
      })
    )

    return { organization, stripe, endsAt }
  }

  it("repousse la fin chez Stripe, reflète la réponse et garde les deux dates au journal", async () => {
    const { stripe, endsAt } = await trialing()
    const admin = await platformAdmin()
    const later = new Date(Date.now() + 20 * DAY_MS)
    const response = await apiRequest<SubscriptionBody>(
      `/admin/subscriptions/${stripe.id}/trial`,
      { body: { ends_at: later.toISOString() }, session: admin }
    )

    expect(response.status).toBe(200)
    expect(response.json.data).toMatchObject({
      status: "trialing",
      current_period_end: later.toISOString(),
    })
    expect(billing.trials).toEqual([
      { subscriptionId: stripe.stripeSubscriptionId, endsAt: later },
    ])

    const event = await harness.prisma.event.findFirstOrThrow({
      where: {
        action: "subscription.updated",
        targetId: stripe.stripeSubscriptionId,
      },
    })

    expect(event.actorUserId).toBe(admin.session.userId)
    expect(event.payload).toMatchObject({
      trial_ends_at: later.toISOString(),
      previous_trial_ends_at: endsAt.toISOString(),
    })
  })

  it("refuse un produit de la plateforme, un abonnement hors essai et une date passée", async () => {
    const { organization } = await atelier()
    const admin = await platformAdmin()
    const granted = await grant(organization.id, admin, { seats: 1 })
    const { organization: other } = await atelier()
    const active = await subscribeOrganization({
      organizationId: other.id,
      status: "active",
    })
    const { stripe } = await trialing()
    const later = new Date(Date.now() + 20 * DAY_MS).toISOString()
    const platform = await apiRequest<ErrorBody>(
      `/admin/subscriptions/${granted.json.data.id}/trial`,
      { body: { ends_at: later }, session: admin }
    )
    const notTrialing = await apiRequest<ErrorBody>(
      `/admin/subscriptions/${active.id}/trial`,
      { body: { ends_at: later }, session: admin }
    )
    const past = await apiRequest<ErrorBody>(
      `/admin/subscriptions/${stripe.id}/trial`,
      {
        body: { ends_at: new Date(Date.now() - DAY_MS).toISOString() },
        session: admin,
      }
    )

    expect(platform.status).toBe(409)
    expect(platform.json.error.code).toBe("conflict")
    expect(platform.json.error.fix).toBeString()
    expect(notTrialing.status).toBe(409)
    expect(notTrialing.json.error.code).toBe("conflict")
    expect(past.status).toBe(422)
    expect(past.json.error.code).toBe("validation")
    expect(billing.trials).toHaveLength(0)
  })

  it("refuse pendant le lancement, un abonnement absent, un membre et un anonyme", async () => {
    const { stripe } = await trialing()
    const admin = await platformAdmin()
    const later = new Date(Date.now() + 20 * DAY_MS).toISOString()
    const missing = await apiRequest<ErrorBody>(
      "/admin/subscriptions/nope/trial",
      { body: { ends_at: later }, session: admin }
    )
    const anonymous = await apiRequest<ErrorBody>(
      `/admin/subscriptions/${stripe.id}/trial`,
      { body: { ends_at: later } }
    )

    expect(missing.status).toBe(404)
    expect(anonymous.status).toBe(401)

    useLaunchBilling()

    const launch = await apiRequest<ErrorBody>(
      `/admin/subscriptions/${stripe.id}/trial`,
      { body: { ends_at: later }, session: admin }
    )

    expect(launch.status).toBe(409)
    expect(launch.json.error.code).toBe("conflict")
    expect(launch.json.error.message).toContain("Stripe")
  })
})

describe("POST /admin/subscriptions/:id/resume", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    billing = useFakeBilling()
  })

  afterAll(() => {
    useFakeBilling()
  })

  async function endingAtPeriodEnd() {
    const { organization } = await atelier()
    const periodEnd = new Date(Date.now() + 12 * DAY_MS)
    const stripe = await subscribeOrganization({
      organizationId: organization.id,
      status: "active",
      quantity: 2,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: true,
    })

    billing.put(
      remoteSubscription({
        id: stripe.stripeSubscriptionId,
        organizationId: organization.id,
        status: "active",
        quantity: 2,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: true,
      })
    )

    return { organization, stripe, periodEnd }
  }

  it("reprend l'abonnement chez Stripe et le miroir cesse d'annoncer la fin", async () => {
    const { stripe, periodEnd } = await endingAtPeriodEnd()
    const admin = await platformAdmin()
    const response = await apiRequest<SubscriptionBody>(
      `/admin/subscriptions/${stripe.id}/resume`,
      { method: "POST", session: admin }
    )

    expect(response.status).toBe(200)
    expect(response.json.data).toMatchObject({
      status: "active",
      cancel_at_period_end: false,
      current_period_end: periodEnd.toISOString(),
    })
    expect(billing.resumptions).toEqual([stripe.stripeSubscriptionId])
    expect(
      await harness.prisma.subscription.findUniqueOrThrow({
        where: { id: stripe.id },
      })
    ).toMatchObject({ cancelAtPeriodEnd: false })

    const event = await harness.prisma.event.findFirstOrThrow({
      where: {
        action: "subscription.updated",
        targetId: stripe.stripeSubscriptionId,
      },
    })

    expect(event.actorUserId).toBe(admin.session.userId)
    expect(event.payload).toMatchObject({
      cancel_at_period_end: false,
      previous_cancel_at_period_end: true,
    })
  })

  it("refuse un abonnement qui ne se termine pas, un abonnement arrêté et un produit de la plateforme", async () => {
    const { organization } = await atelier()
    const admin = await platformAdmin()
    const granted = await grant(organization.id, admin, { seats: 1 })
    const { organization: other } = await atelier()
    const running = await subscribeOrganization({
      organizationId: other.id,
      status: "active",
    })
    const { organization: third } = await atelier()
    const stopped = await subscribeOrganization({
      organizationId: third.id,
      status: "canceled",
      cancelAtPeriodEnd: true,
    })
    const platform = await apiRequest<ErrorBody>(
      `/admin/subscriptions/${granted.json.data.id}/resume`,
      { method: "POST", session: admin }
    )
    const notEnding = await apiRequest<ErrorBody>(
      `/admin/subscriptions/${running.id}/resume`,
      { method: "POST", session: admin }
    )
    const alreadyStopped = await apiRequest<ErrorBody>(
      `/admin/subscriptions/${stopped.id}/resume`,
      { method: "POST", session: admin }
    )

    expect(platform.status).toBe(409)
    expect(notEnding.status).toBe(409)
    expect(notEnding.json.error.code).toBe("conflict")
    expect(notEnding.json.error.fix).toBeString()
    expect(alreadyStopped.status).toBe(409)
    expect(billing.resumptions).toHaveLength(0)
  })

  it("refuse un abonnement absent, un membre et un anonyme", async () => {
    const { organization, stripe } = await endingAtPeriodEnd()
    const [owner] = (await createOrganizationWithMembers({ roles: ["owner"] }))
      .members
    const admin = await platformAdmin()
    const missing = await apiRequest<ErrorBody>(
      "/admin/subscriptions/nope/resume",
      { method: "POST", session: admin }
    )
    const member = await apiRequest<ErrorBody>(
      `/admin/subscriptions/${stripe.id}/resume`,
      { method: "POST", session: owner }
    )
    const anonymous = await apiRequest<ErrorBody>(
      `/admin/subscriptions/${stripe.id}/resume`,
      { method: "POST" }
    )

    expect(organization.id).toBeString()
    expect(missing.status).toBe(404)
    expect(member.status).toBe(403)
    expect(anonymous.status).toBe(401)
  })
})
