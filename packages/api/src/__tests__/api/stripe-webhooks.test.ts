import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { stripeEventLeaseMsFromEnv } from "../../lib/billing/config"
import {
  entitlementForOrganization,
  GRACE_PERIOD_MS,
} from "../../lib/billing/entitlement"
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

interface MeBody {
  entitlement: string
  subscription: { status: string } | null
}

function invoicePaymentFailed(id: string) {
  return stripeEvent("invoice.payment_failed", {
    id,
    object: "invoice",
    customer: "cus_test_1",
    subscription: "sub_test_1",
  })
}

/** What Stripe answers once an invoice of `sub_test_1` failed. */
function pastDue(organizationId: string) {
  return {
    remote: remoteSubscription({ organizationId, status: "past_due" }),
  }
}

function subjectsSent(server: ApiTestServer): string[] {
  return server.sentEmails.map((email) => email.subject)
}

const SECOND_MS = 1000

function secondsFloor(at: number): Date {
  return new Date(Math.floor(at / SECOND_MS) * SECOND_MS)
}

describe("POST /webhooks/stripe", () => {
  let server: ApiTestServer
  let billing: FakeBilling
  let organizationId: string
  let owner: { token: string }

  beforeAll(async () => {
    server = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    billing = useFakeBilling()

    const created = await createOrganizationWithMembers({ roles: ["owner"] })

    organizationId = created.organization.id
    owner = created.members[0]
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

    // Stripe cancels a trial that ends without a card: the period end is the
    // trial's, so already past — the tolerance window extends nothing here.
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
      }),
      pastDue(organizationId)
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

  it("lit l'abonnement d'une facture rangé sous parent.subscription_details", async () => {
    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.created",
        stripeSubscriptionObject({ organizationId, quantity: 1 })
      )
    )

    const failed = await postStripeWebhook<AckBody>(
      stripeEvent(
        "invoice.payment_failed",
        {
          id: "in_test_parent",
          object: "invoice",
          customer: "cus_test_1",
          parent: { subscription_details: { subscription: "sub_test_1" } },
        },
        "evt_test_parent"
      ),
      pastDue(organizationId)
    )

    expect(failed.json.handled).toBe(true)
    expect(
      (
        await server.prisma.subscription.findFirstOrThrow({
          where: { organizationId },
        })
      ).status
    ).toBe("past_due")
    expect(
      (
        await server.prisma.stripeEvent.findUniqueOrThrow({
          where: { id: "evt_test_parent" },
        })
      ).subscriptionId
    ).toBe("sub_test_1")
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

  it("rend leur droit d'usage aux serveurs suspendus par la facturation", async () => {
    const enrolled = await createServer({ organizationId, status: "suspended" })

    await server.prisma.server.update({
      where: { id: enrolled.server.id },
      data: { suspendedReason: "billing" },
    })
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
    expect(restored.suspendedReason).toBeNull()

    const state = await apiRequest<StateBody>("/agent/state", {
      bearer: enrolled.token,
    })

    expect(state.json.entitlement).toBe("valid")
  })

  it("laisse suspendu un serveur que l'équipe a suspendu, abonnement ou pas", async () => {
    const enrolled = await createServer({ organizationId, status: "suspended" })

    await server.prisma.server.update({
      where: { id: enrolled.server.id },
      data: { suspendedReason: "admin" },
    })
    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.updated",
        stripeSubscriptionObject({ organizationId, quantity: 1 })
      )
    )

    const stored = await server.prisma.server.findUniqueOrThrow({
      where: { id: enrolled.server.id },
    })

    expect(stored.status).toBe("suspended")
    expect(stored.suspendedReason).toBe("admin")
  })

  it("ramène les serveurs d'un essai fini, puis suspendus, quand un nouvel abonnement arrive", async () => {
    const enrolled = await createServer({ organizationId })

    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.created",
        stripeSubscriptionObject({ organizationId, status: "trialing" })
      )
    )
    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.deleted",
        stripeSubscriptionObject({
          organizationId,
          status: "canceled",
          currentPeriodEnd: new Date(Date.now() - 60 * SECOND_MS),
        })
      )
    )

    expect(await suspendExpiredGrace(new Date())).toEqual([enrolled.server.id])

    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.created",
        stripeSubscriptionObject({
          id: "sub_new",
          organizationId,
          status: "active",
        })
      )
    )

    const stored = await server.prisma.server.findUniqueOrThrow({
      where: { id: enrolled.server.id },
    })
    const state = await apiRequest<StateBody>("/agent/state", {
      bearer: enrolled.token,
    })
    const me = await apiRequest<MeBody>("/me", { session: owner })

    expect(stored.status).toBe("active")
    expect(state.json.entitlement).toBe("valid")
    expect(me.json.entitlement).toBe("valid")
    expect(me.json.subscription?.status).toBe("active")
  })

  it("ne repousse jamais la tolérance ni ne renvoie l'email sur les relances d'un impayé", async () => {
    const enrolled = await createServer({ organizationId })

    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.created",
        stripeSubscriptionObject({ organizationId })
      )
    )
    await postStripeWebhook<AckBody>(
      invoicePaymentFailed("in_1"),
      pastDue(organizationId)
    )

    const first = await server.prisma.server.findUniqueOrThrow({
      where: { id: enrolled.server.id },
    })
    const emailsAfterFirst = subjectsSent(server).length

    await new Promise((resolve) => setTimeout(resolve, 1100))
    await postStripeWebhook<AckBody>(
      invoicePaymentFailed("in_2"),
      pastDue(organizationId)
    )

    const second = await server.prisma.server.findUniqueOrThrow({
      where: { id: enrolled.server.id },
    })

    expect(emailsAfterFirst).toBe(1)
    expect(second.status).toBe("grace")
    expect(second.entitlementValidUntil?.toISOString()).toBe(
      first.entitlementValidUntil?.toISOString() ?? ""
    )
    expect(subjectsSent(server)).toHaveLength(1)
  })

  it("ne traite qu'une fois deux livraisons concurrentes du même événement", async () => {
    await createServer({ organizationId })
    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.created",
        stripeSubscriptionObject({ organizationId })
      )
    )

    const event = invoicePaymentFailed("in_twice")
    const responses = await Promise.all([
      postStripeWebhook<AckBody | ErrorBody>(event, pastDue(organizationId)),
      postStripeWebhook<AckBody | ErrorBody>(event, pastDue(organizationId)),
    ])
    const handled = responses.filter(
      (response) => (response.json as AckBody).handled === true
    )
    const others = responses.filter((response) => !handled.includes(response))

    expect(handled).toHaveLength(1)
    expect(handled[0]?.json).toMatchObject({ handled: true, duplicate: false })
    expect(others).toHaveLength(1)
    expect(
      others[0]?.status === 409 ||
        (others[0]?.json as AckBody | undefined)?.duplicate === true
    ).toBe(true)
    expect(await server.prisma.stripeEvent.count()).toBe(2)
    expect(subjectsSent(server)).toHaveLength(1)
  })

  it("refuse une livraison pendant qu'une autre traite encore l'événement, pour que Stripe la rejoue", async () => {
    const event = invoicePaymentFailed("in_in_flight")

    await server.prisma.stripeEvent.create({
      data: {
        id: String(event.id),
        type: "invoice.payment_failed",
        status: "processing",
        receivedAt: new Date(),
      },
    })

    const response = await postStripeWebhook<ErrorBody>(event)

    expect(response.status).toBe(409)
    expect(response.json.error.code).toBe("conflict")
    expect(response.json.error.fix).toBeString()
    expect(
      (
        await server.prisma.stripeEvent.findUniqueOrThrow({
          where: { id: String(event.id) },
        })
      ).status
    ).toBe("processing")
  })

  it("reprend un événement resté en cours au-delà du bail, quand son isolate est mort", async () => {
    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.created",
        stripeSubscriptionObject({ organizationId })
      )
    )

    const event = invoicePaymentFailed("in_abandoned")

    await server.prisma.stripeEvent.create({
      data: {
        id: String(event.id),
        type: "invoice.payment_failed",
        status: "processing",
        receivedAt: new Date(Date.now() - stripeEventLeaseMsFromEnv() - 1000),
      },
    })

    const response = await postStripeWebhook<AckBody>(
      event,
      pastDue(organizationId)
    )

    expect(response.status).toBe(200)
    expect(response.json).toMatchObject({ handled: true, duplicate: false })
    expect(
      await server.prisma.stripeEvent.findUniqueOrThrow({
        where: { id: String(event.id) },
      })
    ).toMatchObject({ status: "processed" })
    expect(
      (
        await server.prisma.subscription.findFirstOrThrow({
          where: { organizationId },
        })
      ).status
    ).toBe("past_due")
  })

  it("ne ressuscite pas un abonnement résilié sur un impayé livré en retard", async () => {
    const periodEnd = secondsFloor(Date.now() + 86_400_000)
    const canceled = remoteSubscription({
      organizationId,
      status: "canceled",
      currentPeriodEnd: periodEnd,
    })

    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.deleted",
        stripeSubscriptionObject({
          organizationId,
          status: "canceled",
          currentPeriodEnd: periodEnd,
        })
      )
    )

    const late = await postStripeWebhook<AckBody>(
      invoicePaymentFailed("in_late"),
      { remote: canceled }
    )

    expect(late.json.handled).toBe(true)
    expect(
      await server.prisma.subscription.findFirstOrThrow({
        where: { organizationId },
      })
    ).toMatchObject({ status: "canceled" })
  })

  it("ne met pas en impayé un abonnement que Stripe dit réglé depuis", async () => {
    const enrolled = await createServer({ organizationId })

    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.created",
        stripeSubscriptionObject({ organizationId })
      )
    )
    await postStripeWebhook<AckBody>(invoicePaymentFailed("in_settled"))

    expect(
      await server.prisma.subscription.findFirstOrThrow({
        where: { organizationId },
      })
    ).toMatchObject({ status: "active" })
    expect(
      await server.prisma.server.findUniqueOrThrow({
        where: { id: enrolled.server.id },
      })
    ).toMatchObject({ status: "active" })
    expect(subjectsSent(server)).toHaveLength(0)
  })

  it("garde un événement dont le traitement a échoué pour que Stripe le rejoue", async () => {
    const event = stripeEvent("checkout.session.completed", {
      id: "cs_test_retry",
      object: "checkout.session",
      mode: "subscription",
      customer: "cus_retry",
      subscription: "sub_retry",
      metadata: { organization_id: organizationId },
    })
    const failed = await postStripeWebhook<ErrorBody>(event)

    expect(failed.status).toBe(500)
    expect(failed.json.error.code).toBe("internal")

    const stored = await server.prisma.stripeEvent.findUniqueOrThrow({
      where: { id: String(event.id) },
    })

    expect(stored.status).toBe("failed")
    expect(stored.processedAt).toBeNull()

    billing.put(
      remoteSubscription({
        id: "sub_retry",
        customerId: "cus_retry",
        organizationId,
      })
    )

    const replayed = await postStripeWebhook<AckBody>(event)

    expect(replayed.status).toBe(200)
    expect(replayed.json).toMatchObject({ handled: true, duplicate: false })

    const settled = await server.prisma.stripeEvent.findUniqueOrThrow({
      where: { id: String(event.id) },
    })

    expect(settled.status).toBe("processed")
    expect(settled.processedAt).not.toBeNull()
    expect(await server.prisma.subscription.count()).toBe(1)
  })

  it("relit l'abonnement chez Stripe plutôt que de croire un événement en retard", async () => {
    const periodEnd = secondsFloor(Date.now() + 86_400_000)
    const enrolled = await createServer({ organizationId })

    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.created",
        stripeSubscriptionObject({ organizationId })
      )
    )
    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.deleted",
        stripeSubscriptionObject({
          organizationId,
          status: "canceled",
          currentPeriodEnd: periodEnd,
        })
      )
    )
    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.updated",
        stripeSubscriptionObject({ organizationId, status: "active" })
      ),
      {
        remote: remoteSubscription({
          organizationId,
          status: "canceled",
          currentPeriodEnd: periodEnd,
        }),
      }
    )

    const stored = await server.prisma.server.findUniqueOrThrow({
      where: { id: enrolled.server.id },
    })
    const mirror = await server.prisma.subscription.findFirstOrThrow({
      where: { organizationId },
    })

    expect(mirror.status).toBe("canceled")
    expect(stored.status).toBe("grace")
    expect(stored.entitlementValidUntil?.toISOString()).toBe(
      periodEnd.toISOString()
    )
  })

  it("met les serveurs en tolérance sept jours quand Stripe dit past_due, et /me le dit aussi", async () => {
    const periodEnd = new Date(Date.now() + 25 * 86_400_000)
    const enrolled = await createServer({ organizationId })

    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.created",
        stripeSubscriptionObject({
          organizationId,
          currentPeriodEnd: periodEnd,
        })
      )
    )
    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.updated",
        stripeSubscriptionObject({
          organizationId,
          status: "past_due",
          currentPeriodEnd: periodEnd,
        })
      )
    )

    const stored = await server.prisma.server.findUniqueOrThrow({
      where: { id: enrolled.server.id },
    })
    const state = await apiRequest<StateBody>("/agent/state", {
      bearer: enrolled.token,
    })
    const me = await apiRequest<MeBody>("/me", { session: owner })
    const held = await entitlementForOrganization(organizationId)

    expect(stored.status).toBe("grace")
    expect(state.json.entitlement).toBe("grace")
    expect(me.json.entitlement).toBe("grace")
    expect(held.valid_until.toISOString()).toBe(
      stored.entitlementValidUntil?.toISOString() ?? ""
    )
    expect(new Date(state.json.valid_until).getTime()).toBeLessThan(
      periodEnd.getTime()
    )
    expect(
      await suspendExpiredGrace(
        new Date(Date.now() + GRACE_PERIOD_MS + SECOND_MS)
      )
    ).toEqual([enrolled.server.id])
  })

  it("lit un abonnement incomplete comme suspendu", async () => {
    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.created",
        stripeSubscriptionObject({ organizationId, status: "incomplete" })
      )
    )

    expect((await entitlementForOrganization(organizationId)).state).toBe(
      "suspended"
    )
  })

  it("préfère l'abonnement vivant à l'ancien qui reçoit encore des événements", async () => {
    const enrolled = await createServer({ organizationId })

    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.created",
        stripeSubscriptionObject({ id: "sub_old", organizationId })
      )
    )
    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.created",
        stripeSubscriptionObject({ id: "sub_new", organizationId, quantity: 4 })
      )
    )
    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.deleted",
        stripeSubscriptionObject({
          id: "sub_old",
          organizationId,
          status: "canceled",
          currentPeriodEnd: secondsFloor(Date.now() + 86_400_000),
        })
      )
    )

    const held = await entitlementForOrganization(organizationId)
    const stored = await server.prisma.server.findUniqueOrThrow({
      where: { id: enrolled.server.id },
    })
    const me = await apiRequest<{
      entitlement: string
      subscription: { status: string; servers: { limit: number } } | null
    }>("/me", { session: owner })

    expect(held.state).toBe("valid")
    expect(stored.status).toBe("active")
    expect(me.json.entitlement).toBe("valid")
    expect(me.json.subscription).toMatchObject({
      status: "active",
      servers: { limit: 4 },
    })
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

  it("garde la résiliation en fin de période, et la retire quand Stripe la retire", async () => {
    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.updated",
        stripeSubscriptionObject({
          organizationId,
          status: "active",
          cancelAtPeriodEnd: true,
        })
      )
    )

    expect(
      await server.prisma.subscription.findFirstOrThrow({
        where: { stripeSubscriptionId: "sub_test_1" },
      })
    ).toMatchObject({ status: "active", cancelAtPeriodEnd: true })

    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.updated",
        stripeSubscriptionObject({ organizationId, status: "active" })
      )
    )

    expect(
      await server.prisma.subscription.findFirstOrThrow({
        where: { stripeSubscriptionId: "sub_test_1" },
      })
    ).toMatchObject({ cancelAtPeriodEnd: false })
  })

  it("classe chaque livraison sous l'abonnement qu'elle nomme", async () => {
    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.created",
        stripeSubscriptionObject({ organizationId })
      )
    )
    await postStripeWebhook<AckBody>(invoicePaymentFailed("in_classement"))
    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.created",
        stripeSubscriptionObject({ id: "sub_orphan", customerId: "cus_orphan" })
      )
    )

    const filed = await server.prisma.stripeEvent.findMany({
      where: { subscriptionId: "sub_test_1" },
      orderBy: { type: "asc" },
    })

    expect(filed.map((event) => event.type)).toEqual([
      "customer.subscription.created",
      "invoice.payment_failed",
    ])
    expect(
      await server.prisma.stripeEvent.count({
        where: { subscriptionId: "sub_orphan" },
      })
    ).toBe(1)
  })
})
