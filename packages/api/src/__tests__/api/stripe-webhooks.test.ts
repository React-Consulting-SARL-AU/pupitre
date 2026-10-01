import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { FREE_SERVERS } from "@pupitre/shared/plans"
import { stripeEventLeaseMsFromEnv } from "../../lib/billing/config"
import type { FakeBilling } from "../../lib/billing/fake"
import { suspendExpiredGrace } from "../../lib/billing/grace"
import {
  GRACE_PERIOD_MS,
  licenseForOrganization,
} from "../../lib/billing/license"
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
  license: string
  valid_until: string
}

interface MeBody {
  license: string
  license_grant: { status: string } | null
}

function invoicePaymentFailed(id: string) {
  return stripeEvent("invoice.payment_failed", {
    id,
    object: "invoice",
    customer: "cus_test_1",
    subscription: "sub_test_1",
  })
}

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

// Within the free servers a lost subscription changes nothing; one more puts them all at stake.
async function beyondFreeServers(organizationId: string) {
  const [first] = await Promise.all(
    Array.from({ length: FREE_SERVERS + 1 }, () =>
      createServer({ organizationId })
    )
  )

  if (!first) {
    throw new Error("no server created")
  }

  return first
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

  it("refuses an invalid signature", async () => {
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

  it("refuses a missing or unreadable header", async () => {
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

  it("refuses a signature outside the five-minute tolerance", async () => {
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

  it("mirrors the subscription on creation, then on update", async () => {
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

  it("does nothing more when an event is replayed", async () => {
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

  it("attaches the Stripe customer and the subscription at the end of checkout", async () => {
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

  it("puts the servers beyond the free ones into grace on cancellation", async () => {
    const periodEnd = secondsFloor(Date.now() + 3 * 86_400_000)
    const enrolled = await beyondFreeServers(organizationId)

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
    expect(stored.licenseValidUntil?.getTime()).toBeGreaterThan(
      Date.now() + GRACE_PERIOD_MS - 60 * SECOND_MS
    )

    const state = await apiRequest<StateBody>("/agent/state", {
      bearer: enrolled.token,
    })

    expect(state.status).toBe(200)
    expect(state.json.license).toBe("grace")
    expect(state.json.valid_until).toBe(
      stored.licenseValidUntil?.toISOString() ?? ""
    )

    const canceled = await server.prisma.event.findFirstOrThrow({
      where: { action: "subscription.canceled" },
    })

    expect(canceled.organizationId).toBe(organizationId)
  })

  it("leaves the free servers active on cancellation", async () => {
    const enrolled = await createServer({ organizationId })

    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.created",
        stripeSubscriptionObject({ organizationId, quantity: 1 })
      )
    )
    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.deleted",
        stripeSubscriptionObject({
          organizationId,
          quantity: 1,
          status: "canceled",
          currentPeriodEnd: secondsFloor(Date.now() - 60_000),
        })
      )
    )

    expect(await suspendExpiredGrace(new Date())).toEqual([])

    const state = await apiRequest<StateBody>("/agent/state", {
      bearer: enrolled.token,
    })

    expect(state.json.license).toBe("valid")
  })

  it("puts the organization in grace for seven days on an unpaid invoice, then suspends", async () => {
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
    expect(graced.licenseValidUntil?.getTime()).toBeGreaterThan(
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

    expect(inGrace.json.license).toBe("grace")

    const suspended = await suspendExpiredGrace(
      new Date(Date.now() + GRACE_PERIOD_MS + SECOND_MS)
    )

    expect(suspended).toEqual([enrolled.server.id])

    const afterGrace = await apiRequest<StateBody>("/agent/state", {
      bearer: enrolled.token,
    })

    expect(afterGrace.json.license).toBe("suspended")
  })

  it("reads an invoice's subscription stored under parent.subscription_details", async () => {
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

  it("gives the servers their licence back when the subscription restarts", async () => {
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

    expect(state.json.license).toBe("valid")
  })

  it("gives the servers suspended by billing their licence back", async () => {
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

    expect(state.json.license).toBe("valid")
  })

  it("leaves suspended a server the team suspended, subscription or not", async () => {
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

  it("restores the servers suspended after a cancellation when a new subscription arrives", async () => {
    const enrolled = await beyondFreeServers(organizationId)

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
          currentPeriodEnd: new Date(Date.now() - 60 * SECOND_MS),
        })
      )
    )

    expect(
      await suspendExpiredGrace(
        new Date(Date.now() + GRACE_PERIOD_MS + SECOND_MS)
      )
    ).toContain(enrolled.server.id)

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
    expect(state.json.license).toBe("valid")
    expect(me.json.license).toBe("valid")
    expect(me.json.license_grant?.status).toBe("active")
  })

  it("never extends the grace nor resends the email on unpaid-invoice retries", async () => {
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
    expect(second.licenseValidUntil?.toISOString()).toBe(
      first.licenseValidUntil?.toISOString() ?? ""
    )
    expect(subjectsSent(server)).toHaveLength(1)
  })

  it("processes only once two concurrent deliveries of the same event", async () => {
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

  it("refuses a delivery while another is still processing the event, so Stripe replays it", async () => {
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

  it("takes over an event left in progress beyond the lease, when its isolate died", async () => {
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

  it("does not resurrect a cancelled subscription on a late-delivered unpaid invoice", async () => {
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

  it("does not mark unpaid a subscription that Stripe has since said is settled", async () => {
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

  it("keeps an event whose processing failed so Stripe replays it", async () => {
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

  it("rereads the subscription at Stripe rather than trusting a late event", async () => {
    const periodEnd = secondsFloor(Date.now() + 86_400_000)
    const enrolled = await beyondFreeServers(organizationId)

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
  })

  it("puts the servers in grace for seven days when Stripe says past_due, and /me says so too", async () => {
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
    const held = await licenseForOrganization(organizationId)

    expect(stored.status).toBe("grace")
    expect(state.json.license).toBe("grace")
    expect(me.json.license).toBe("grace")
    expect(held.valid_until.toISOString()).toBe(
      stored.licenseValidUntil?.toISOString() ?? ""
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

  it("reads an incomplete subscription as no licence", async () => {
    await postStripeWebhook<AckBody>(
      stripeEvent(
        "customer.subscription.created",
        stripeSubscriptionObject({ organizationId, status: "incomplete" })
      )
    )

    expect((await licenseForOrganization(organizationId)).state).toBe("valid")

    await beyondFreeServers(organizationId)

    expect((await licenseForOrganization(organizationId)).state).toBe(
      "suspended"
    )
  })

  it("prefers the live subscription to the old one that still receives events", async () => {
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

    const held = await licenseForOrganization(organizationId)
    const stored = await server.prisma.server.findUniqueOrThrow({
      where: { id: enrolled.server.id },
    })
    const me = await apiRequest<{
      license: string
      servers: { limit: number } | null
      license_grant: { status: string; seats: number } | null
    }>("/me", { session: owner })

    expect(held.state).toBe("valid")
    expect(stored.status).toBe("active")
    expect(me.json.license).toBe("valid")
    expect(me.json.license_grant).toMatchObject({ status: "active", seats: 4 })
    expect(me.json.servers).toMatchObject({ limit: FREE_SERVERS + 4 })
  })

  it("ignores an event whose organization is unknown", async () => {
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

  it("keeps the end-of-period cancellation, and removes it when Stripe removes it", async () => {
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

  it("files each delivery under the subscription it names", async () => {
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
