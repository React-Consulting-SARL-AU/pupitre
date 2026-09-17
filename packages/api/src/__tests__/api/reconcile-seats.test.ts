import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { reconcileSeats } from "../../lib/billing/reconcile"
import { type ApiTestServer, bootApiTestServer, resetDb } from "../../testing"
import { useFakeBilling } from "../../testing/billing"
import {
  createOrganizationWithMembers,
  createServer,
  subscribeOrganization,
} from "../../testing/factories"

async function organizationSeating(servers: number, paid: number) {
  const { organization, members } = await createOrganizationWithMembers({
    roles: ["owner", "member"],
  })
  const subscription = await subscribeOrganization({
    organizationId: organization.id,
    quantity: paid,
    status: "active",
  })

  for (let index = 0; index < servers; index += 1) {
    await createServer({ organizationId: organization.id })
  }

  return { organization, owner: members[0], subscription }
}

describe("reconcileSeats", () => {
  let server: ApiTestServer

  beforeAll(async () => {
    server = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    useFakeBilling()
  })

  it("reports a drift without touching Stripe", async () => {
    const { organization, subscription } = await organizationSeating(1, 4)
    const report = await reconcileSeats()

    expect(report).toEqual([
      {
        organization_id: organization.id,
        stripe_subscription_id: subscription.stripeSubscriptionId,
        status: "active",
        paid: 4,
        seated: 1,
        drift: -3,
        applied: false,
      },
    ])
    expect(useFakeBilling().quantities).toHaveLength(0)
  })

  it("writes the journal and warns the owner when more servers sit than seats are paid", async () => {
    const { organization, owner } = await organizationSeating(3, 2)
    const report = await reconcileSeats()

    expect(report[0]).toMatchObject({ paid: 2, seated: 3, drift: 1 })

    const event = await server.prisma.event.findFirstOrThrow({
      where: { action: "seats.drifted", organizationId: organization.id },
    })

    expect(event.actorUserId).toBeNull()
    expect(event.payload).toMatchObject({ paid: 2, seated: 3, drift: 1 })

    const warned = server.sentEmails.filter(
      (email) => email.to === owner.user.email
    )

    expect(warned).toHaveLength(1)
    expect(warned[0]?.text).toContain("3")
    expect(warned[0]?.text).toContain("2")
  })

  it("stays silent when the paid seats cover the servers", async () => {
    await organizationSeating(1, 4)
    await organizationSeating(2, 2)
    await reconcileSeats()

    expect(
      await server.prisma.event.count({ where: { action: "seats.drifted" } })
    ).toBe(0)
    expect(server.sentEmails).toHaveLength(0)
  })

  it("resizes the subscription only when asked to apply", async () => {
    const billing = useFakeBilling()
    const { subscription } = await organizationSeating(3, 2)

    billing.put({
      id: subscription.stripeSubscriptionId,
      customer_id: "cus_seat",
      status: "active",
      product: "prod_server",
      quantity: 2,
      interval: "month",
      current_period_end: null,
      organization_id: null,
    })

    const report = await reconcileSeats({ apply: true })

    expect(report[0]?.applied).toBe(true)
    expect(billing.quantities).toEqual([
      { subscriptionId: subscription.stripeSubscriptionId, quantity: 3 },
    ])
  })
})
