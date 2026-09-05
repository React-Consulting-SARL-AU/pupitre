import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { GRACE_PERIOD_MS } from "../../lib/billing/entitlement"
import type { FakeBilling } from "../../lib/billing/fake"
import { suspendExpiredGrace } from "../../lib/billing/grace"
import { SIGNATURE_TOLERANCE_MS } from "../../lib/billing/signature"
import { type ApiTestServer, bootApiTestServer, resetDb } from "../../testing"
import {
  postStripeWebhook,
  remoteSubscription,
  stripeEvent,
  stripeSubscriptionObject,
  useFakeBilling,
} from "../../testing/billing"
import {
  createOrganizationWithMembers,
  createServer,
} from "../../testing/factories"
import { apiRequest } from "../../testing/request"

interface AckBody {
  received: boolean
  handled: boolean
  duplicate: boolean
}

interface ErrorBody {
  error: { code: string; message: string; fix?: string }
}

interface StateBody {
  entitlement: string
  valid_until: string
}

const SECOND_MS = 1000

function secondsFloor(at: number): Date {
  return new Date(Math.floor(at / SECOND_MS) * SECOND_MS)
}

describe("POST /webhooks/stripe", () => {
  let server: ApiTestServer
  let billing: FakeBilling
  let organizationId: string

  beforeAll(async () => {
    server = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    billing = useFakeBilling()

    const created = await createOrganizationWithMembers({ roles: ["owner"] })

    organizationId = created.organization.id
  })

  it("refuse une signature invalide", async () => {
    const response = await postStripeWebhook<ErrorBody>(
      stripeEvent(
        "customer.subscription.created",
        stripeSubscriptionObject({ organizationId })
      ),
      { secret: "whsec_wrong_secret" }
    )

    expect(response.status).toBe(400)
    expect(response.json.error.code).toBe("stripe_signature_invalid")
    expect(await server.prisma.subscription.count()).toBe(0)
    expect(await server.prisma.stripeEvent.count()).toBe(0)
  })

  it("refuse un en-tête absent ou illisible", async () => {
    const missing = await postStripeWebhook<ErrorBody>(
      stripeEvent("customer.subscription.created", {}),
      { signature: "" }
    )
    const malformed = await postStripeWebhook<ErrorBody>(
      stripeEvent("customer.subscription.created", {}),
      { signature: "t=abc,v2=nope" }
    )

    expect(missing.status).toBe(400)
    expect(missing.json.error.code).toBe("stripe_signature_invalid")
    expect(malformed.status).toBe(400)
    expect(malformed.json.error.code).toBe("stripe_signature_invalid")
  })

  it("refuse une signature hors de la tolérance de cinq minutes", async () => {
    const stale = new Date(Date.now() - SIGNATURE_TOLERANCE_MS - 60 * SECOND_MS)
    const response = await postStripeWebhook<ErrorBody>(
      stripeEvent(
        "customer.subscription.created",
        stripeSubscriptionObject({ organizationId })
      ),
      { signedAt: stale }
    )

    expect(response.status).toBe(400)
    expect(response.json.error.code).toBe("stripe_signature_invalid")
    expect(await server.prisma.subscription.count()).toBe(0)
  })

  it("miroir de l'abonnement à la création, puis à la mise à jour", async () => {
    const created = await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.created",
        stripeSubscriptionObject({ organizationId, quantity: 2 })
      )
    )

    expect(created.status).toBe(200)
    expect(created.json).toMatchObject({ handled: true, duplicate: false })

    const mirrored = await server.prisma.subscription.findFirstOrThrow({
      where: { organizationId },
    })

    expect(mirrored).toMatchObject({
      stripeSubscriptionId: "sub_test_1",
      quantity: 2,
      status: "active",
      product: "prod_server",
    })

    const billingRow =
      await server.prisma.organizationBilling.findUniqueOrThrow({
        where: { organizationId },
      })

    expect(billingRow.stripeCustomerId).toBe("cus_test_1")
    expect(billingRow.defaultInterval).toBe("month")

    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.updated",
        stripeSubscriptionObject({ organizationId, quantity: 5 })
      )
    )

    const updated = await server.prisma.subscription.findFirstOrThrow({
      where: { organizationId },
    })

    expect(updated.quantity).toBe(5)
    expect(await server.prisma.subscription.count()).toBe(1)

    const actions = await server.prisma.event.findMany({
      where: { targetType: "subscription" },
      orderBy: { createdAt: "asc" },
      select: { action: true },
    })

    expect(actions.map((event) => event.action)).toEqual([
      "subscription.created",
      "subscription.updated",
    ])
  })

  it("ne fait rien de plus quand un événement est rejoué", async () => {
    const event = stripeEvent(
      "customer.subscription.created",
      stripeSubscriptionObject({ organizationId, quantity: 2 }),
      "evt_replay"
    )
    const first = await postStripeWebhook<AckBody>(event)
    const second = await postStripeWebhook<AckBody>(event)

    expect(first.json).toMatchObject({ handled: true, duplicate: false })
    expect(second.status).toBe(200)
    expect(second.json).toMatchObject({ handled: false, duplicate: true })
    expect(await server.prisma.stripeEvent.count()).toBe(1)
    expect(await server.prisma.subscription.count()).toBe(1)
    expect(
      await server.prisma.event.count({ where: { targetType: "subscription" } })
    ).toBe(1)
  })

  it("branche le client Stripe et l'abonnement à la fin du checkout", async () => {
    billing.put(
      remoteSubscription({
        id: "sub_checkout",
        customerId: "cus_checkout",
        organizationId,
        quantity: 3,
        interval: "year",
      })
    )

    const response = await postStripeWebhook<AckBody>(
      stripeEvent("checkout.session.completed", {
        id: "cs_test_checkout",
        object: "checkout.session",
        mode: "subscription",
        customer: "cus_checkout",
        subscription: "sub_checkout",
        metadata: { organization_id: organizationId },
      })
    )

    expect(response.json.handled).toBe(true)

    const billingRow =
      await server.prisma.organizationBilling.findUniqueOrThrow({
        where: { organizationId },
      })

    expect(billingRow).toMatchObject({
      stripeCustomerId: "cus_checkout",
      defaultInterval: "year",
    })
    expect(
      (
        await server.prisma.subscription.findFirstOrThrow({
          where: { organizationId },
        })
      ).quantity
    ).toBe(3)
  })

  it("passe les serveurs en tolérance à la résiliation, avec la date de fin", async () => {
    const periodEnd = secondsFloor(Date.now() + 3 * 86_400_000)
    const enrolled = await createServer({ organizationId })

    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.created",
        stripeSubscriptionObject({ organizationId, quantity: 1 })
      )
    )

    const deleted = await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.deleted",
        stripeSubscriptionObject({
          organizationId,
          quantity: 1,
          status: "canceled",
          currentPeriodEnd: periodEnd,
        })
      )
    )

    expect(deleted.json.handled).toBe(true)

    const stored = await server.prisma.server.findUniqueOrThrow({
      where: { id: enrolled.server.id },
    })

    expect(stored.status).toBe("grace")
    expect(stored.entitlementValidUntil?.toISOString()).toBe(
      periodEnd.toISOString()
    )

    const state = await apiRequest<StateBody>("/agent/state", {
      bearer: enrolled.token,
    })

    expect(state.status).toBe(200)
    expect(state.json.entitlement).toBe("grace")
    expect(state.json.valid_until).toBe(periodEnd.toISOString())

    const canceled = await server.prisma.event.findFirstOrThrow({
      where: { action: "subscription.canceled" },
    })

    expect(canceled.organizationId).toBe(organizationId)
  })

  it("coupe l'accès dès la fin d'un essai, sans sursis supplémentaire", async () => {
    const trialEnd = secondsFloor(Date.now() - 60_000)
    const enrolled = await createServer({ organizationId })

    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.created",
        stripeSubscriptionObject({
          organizationId,
          quantity: 1,
          status: "trialing",
        })
      )
    )

    // Stripe résilie un essai qui finit sans carte : la fin de période est celle
    // de l'essai, donc déjà passée — la tolérance ne rallonge rien.
    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.deleted",
        stripeSubscriptionObject({
          organizationId,
          quantity: 1,
          status: "canceled",
          currentPeriodEnd: trialEnd,
        })
      )
    )

    expect(await suspendExpiredGrace(new Date())).toContain(enrolled.server.id)

    const stored = await server.prisma.server.findUniqueOrThrow({
      where: { id: enrolled.server.id },
    })

    expect(stored.status).toBe("suspended")

    const state = await apiRequest<StateBody>("/agent/state", {
      bearer: enrolled.token,
    })

    expect(state.json.entitlement).toBe("suspended")
  })

  it("met l'organisation en tolérance sept jours sur un impayé, puis suspend", async () => {
    const enrolled = await createServer({ organizationId })

    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.created",
        stripeSubscriptionObject({ organizationId, quantity: 1 })
      )
    )

    const failed = await postStripeWebhook<AckBody>(
      stripeEvent("invoice.payment_failed", {
        id: "in_test_1",
        object: "invoice",
        customer: "cus_test_1",
        subscription: "sub_test_1",
      })
    )

    expect(failed.json.handled).toBe(true)

    const graced = await server.prisma.server.findUniqueOrThrow({
      where: { id: enrolled.server.id },
    })

    expect(graced.status).toBe("grace")
    expect(graced.entitlementValidUntil?.getTime()).toBeGreaterThan(
      Date.now() + GRACE_PERIOD_MS - 60 * SECOND_MS
    )
    expect(
      (
        await server.prisma.subscription.findFirstOrThrow({
          where: { organizationId },
        })
      ).status
    ).toBe("past_due")

    const inGrace = await apiRequest<StateBody>("/agent/state", {
      bearer: enrolled.token,
    })

    expect(inGrace.json.entitlement).toBe("grace")

    const suspended = await suspendExpiredGrace(
      new Date(Date.now() + GRACE_PERIOD_MS + SECOND_MS)
    )

    expect(suspended).toEqual([enrolled.server.id])

    const afterGrace = await apiRequest<StateBody>("/agent/state", {
      bearer: enrolled.token,
    })

    expect(afterGrace.json.entitlement).toBe("suspended")
  })

  it("rend leur droit d'usage aux serveurs quand l'abonnement repart", async () => {
    const enrolled = await createServer({ organizationId, status: "grace" })

    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.updated",
        stripeSubscriptionObject({ organizationId, quantity: 1 })
      )
    )

    const restored = await server.prisma.server.findUniqueOrThrow({
      where: { id: enrolled.server.id },
    })

    expect(restored.status).toBe("active")

    const state = await apiRequest<StateBody>("/agent/state", {
      bearer: enrolled.token,
    })

    expect(state.json.entitlement).toBe("valid")
  })

  it("ignore un événement dont l'organisation est inconnue", async () => {
    const response = await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.created",
        stripeSubscriptionObject({ id: "sub_orphan", customerId: "cus_orphan" })
      )
    )

    expect(response.status).toBe(200)
    expect(response.json).toMatchObject({ handled: false, duplicate: false })
    expect(await server.prisma.subscription.count()).toBe(0)
    expect(await server.prisma.stripeEvent.count()).toBe(1)
  })
})
