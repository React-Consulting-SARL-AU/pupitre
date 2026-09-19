import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { GRANTED_PRODUCT, LAUNCH_PRODUCT } from "@pupitre/shared/plans"
import { PLATFORM_ORGANIZATION_ID } from "@pupitre/shared/platform"
import { expireGrantedSubscriptions } from "../../lib/billing/admin"
import type { FakeBilling } from "../../lib/billing/fake"
import { launchSubscriptionId } from "../../lib/billing/launch"
import { type ApiTestServer, bootApiTestServer, resetDb } from "../../testing"
import { remoteSubscription, useFakeBilling } from "../../testing/billing"
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
  note: string | null
  platform: boolean
  live: boolean
  organization: { id: string; name: string; slug: string }
}

interface SubscriptionBody {
  data: AdminSubscription
}

interface SubscriptionDetailBody {
  data: AdminSubscription & {
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
