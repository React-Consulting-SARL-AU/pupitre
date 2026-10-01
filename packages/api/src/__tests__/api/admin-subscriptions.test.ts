import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { FREE_SERVERS, GRANTED_PRODUCT } from "@pupitre/shared/plans"
import { PLATFORM_ORGANIZATION_ID } from "@pupitre/shared/platform"
import { expireGrantedSubscriptions } from "../../lib/billing/admin"
import type { FakeBilling } from "../../lib/billing/fake"
import { GRACE_PERIOD_MS } from "../../lib/billing/license"
import { type ApiTestServer, bootApiTestServer, resetDb } from "../../testing"
import {
  remoteSubscription,
  useBillingOff,
  useFakeBilling,
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
  allowed_actions: string[]
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
  license: string
  servers: { used: number; limit: number } | null
  license_grant: { status: string; seats: number } | null
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

async function fillFreeServers(organizationId: string) {
  for (let index = 0; index < FREE_SERVERS; index += 1) {
    await createServer({ organizationId })
  }
}

// The free servers never depend on a licence: one more puts them all at stake.
async function serversBeyondFree(organizationId: string) {
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

  it("grants a subscription outside Stripe, restores the servers and keeps the note in the log", async () => {
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

    expect(me.json.license).toBe("valid")
    expect(me.json.license_grant).toMatchObject({ status: "active", seats: 3 })
    expect(me.json.servers).toMatchObject({ limit: FREE_SERVERS + 3 })
  })

  it("grants without an end date or note", async () => {
    const { organization } = await atelier()
    const admin = await platformAdmin()
    const response = await grant(organization.id, admin, { seats: 1 })

    expect(response.status).toBe(201)
    expect(response.json.data.current_period_end).toBeNull()
    expect(response.json.data.note).toBeNull()
  })

  it("refuses when the organization already has a running subscription", async () => {
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

  it("grants on top of a cancelled subscription", async () => {
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

  it("refuses the Pupitre organization, which needs nothing", async () => {
    const admin = await platformAdmin()
    const response = await grant(PLATFORM_ORGANIZATION_ID, admin)

    expect(response.status).toBe(409)
    expect(response.json.error.code).toBe("conflict")
    expect(response.json.error.message).toContain("Pupitre")
  })

  it("returns not_found on an unknown organization, and validation on out-of-range seats", async () => {
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

describe("GET and PATCH /admin/subscriptions/:id", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    billing = useFakeBilling()
  })

  it("details a subscription with its organization and log", async () => {
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
      allowed_actions: ["resize", "cancel", "delete"],
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

  it("lists granted subscriptions by their product, with note and platform", async () => {
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

  it("resizes a granted subscription and moves its end", async () => {
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

  it("refuses to resize below the servers that occupy a seat", async () => {
    const { organization } = await atelier()
    const admin = await platformAdmin()
    const granted = await grant(organization.id, admin, { seats: 3 })

    for (let index = 0; index < FREE_SERVERS + 2; index += 1) {
      await createServer({ organizationId: organization.id })
    }

    const response = await apiRequest<ErrorBody>(
      `/admin/subscriptions/${granted.json.data.id}`,
      { method: "PATCH", body: { seats: 1 }, session: admin, locale: "fr" }
    )

    expect(response.status).toBe(409)
    expect(response.json.error.code).toBe("conflict")
    expect(response.json.error.message).toContain("2")
  })

  it("resizes only a granted subscription", async () => {
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

  it("stops a granted subscription immediately and puts the servers beyond the free ones in grace", async () => {
    const { organization, owner } = await atelier()
    const { server } = await serversBeyondFree(organization.id)
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

    const graced = await harness.prisma.server.findUniqueOrThrow({
      where: { id: server.id },
    })

    expect(graced.status).toBe("grace")
    expect(graced.licenseValidUntil?.getTime()).toBeGreaterThan(
      before + GRACE_PERIOD_MS - 60_000
    )

    const event = await harness.prisma.event.findFirstOrThrow({
      where: {
        action: "subscription.canceled",
        targetId: granted.json.data.stripe_subscription_id,
      },
    })

    expect(event.actorUserId).toBe(admin.session.userId)
    expect(event.payload).toMatchObject({ reason: "fin du partenariat" })

    const me = await apiRequest<MeBody>("/me", { session: owner })

    expect(me.json.license).toBe("grace")
    expect(me.json.license_grant).toBeNull()
  })

  it("stops a granted subscription without touching the free servers", async () => {
    const { organization } = await atelier()
    const { server } = await createServer({ organizationId: organization.id })
    const admin = await platformAdmin()
    const granted = await grant(organization.id, admin, { seats: 2 })
    const response = await apiRequest<SubscriptionBody>(
      `/admin/subscriptions/${granted.json.data.id}/cancel`,
      { body: { reason: "abus" }, session: admin }
    )

    expect(response.status).toBe(200)
    expect(response.json.data.status).toBe("canceled")
    expect(
      await harness.prisma.server.findUniqueOrThrow({
        where: { id: server.id },
      })
    ).toMatchObject({ status: "active" })
  })

  it("cancels at Stripe, mirrors the response and opens the grace beyond the free servers", async () => {
    const { organization } = await atelier()
    const { server } = await serversBeyondFree(organization.id)
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
    ).toMatchObject({ status: "grace" })
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

  it("refuses an already cancelled subscription, and returns not_found without a row", async () => {
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

  it("erases a granted subscription still running, and the servers beyond the free ones follow", async () => {
    const { organization, owner } = await atelier()
    const { server } = await serversBeyondFree(organization.id)
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
    ).toMatchObject({ status: "grace" })

    const event = await harness.prisma.event.findFirstOrThrow({
      where: { action: "subscription.deleted" },
    })

    expect(event.actorUserId).toBe(admin.session.userId)
    expect(event.targetId).toBe(granted.json.data.stripe_subscription_id)
    expect(event.organizationId).toBe(organization.id)

    const me = await apiRequest<MeBody>("/me", { session: owner })

    expect(me.json.license).toBe("grace")
    expect(me.json.license_grant).toBeNull()
  })

  it("erases a cancelled Stripe row without touching the servers the live subscription covers", async () => {
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

  it("refuses a Stripe row that is still live: cancel it first", async () => {
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

describe("the expiry of a granted subscription", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    useFakeBilling()
  })

  it("closes what has expired and opens the grace of the servers beyond the free ones", async () => {
    const { organization } = await atelier()
    const { server } = await serversBeyondFree(organization.id)
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
    ).toMatchObject({
      status: "grace",
      licenseValidUntil: new Date(now.getTime() + GRACE_PERIOD_MS),
    })
    expect(await expireGrantedSubscriptions(now)).toEqual([])
  })

  it("leaves the servers active when a Stripe subscription already counts for the organization", async () => {
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

describe("GET /admin/subscriptions, filters and sorts", () => {
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

  it("filters by organization", async () => {
    const { bureau, other } = await twoOrganizations()
    const admin = await platformAdmin()
    const response = await apiRequest<SubscriptionsBody>(
      `/admin/subscriptions?organization_id=${bureau.id}`,
      { session: admin }
    )

    expect(response.json.total).toBe(1)
    expect(response.json.data.map((row) => row.id)).toEqual([other.id])
  })

  it("keeps or drops the one that counts for its organization", async () => {
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

  it("searches by name, by slug and by Stripe identifier", async () => {
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

  it("carries the paid seats, the occupied seats and the drift on each row", async () => {
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

    await fillFreeServers(organization.id)
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

  it("sorts by period end in both directions, and refuses an unknown sort", async () => {
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

  it("sorts by creation and by modification in both directions", async () => {
    const { counted, dropped, other } = await twoOrganizations()
    const admin = await platformAdmin()
    const order = [counted.id, dropped.id, other.id]

    for (const [rank, id] of order.entries()) {
      await harness.prisma.subscription.update({
        where: { id },
        data: {
          createdAt: new Date(Date.now() - (order.length - rank) * DAY_MS),
          updatedAt: new Date(Date.now() - (rank + 1) * DAY_MS),
        },
      })
    }

    const oldest = await apiRequest<SubscriptionsBody>(
      "/admin/subscriptions?sort=created_at&direction=asc",
      { session: admin }
    )
    const newest = await apiRequest<SubscriptionsBody>(
      "/admin/subscriptions?sort=created_at&direction=desc",
      { session: admin }
    )
    const touched = await apiRequest<SubscriptionsBody>(
      "/admin/subscriptions?sort=updated_at&direction=desc",
      { session: admin }
    )

    expect(oldest.json.data.map((row) => row.id)).toEqual(order)
    expect(newest.json.data.map((row) => row.id)).toEqual([...order].reverse())
    expect(touched.json.data.map((row) => row.id)).toEqual(order)
  })

  it("flags as drifting only the subscription that counts, and the filter keeps only it", async () => {
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier serré",
      roles: ["owner"],
    })
    const closed = await subscribeOrganization({
      organizationId: organization.id,
      status: "canceled",
      quantity: 1,
    })
    const tight = await subscribeOrganization({
      organizationId: organization.id,
      status: "active",
      quantity: 1,
    })
    const { other } = await twoOrganizations()
    const admin = await platformAdmin()

    await fillFreeServers(organization.id)
    await createServer({ organizationId: organization.id })
    await createServer({ organizationId: organization.id, status: "grace" })

    const every = await apiRequest<SubscriptionsBody>("/admin/subscriptions", {
      session: admin,
    })
    const byId = new Map(every.json.data.map((row) => [row.id, row]))
    const adrift = await apiRequest<SubscriptionsBody>(
      "/admin/subscriptions?drifted=true",
      { session: admin }
    )
    const covered = await apiRequest<SubscriptionsBody>(
      "/admin/subscriptions?drifted=false",
      { session: admin }
    )

    expect(byId.get(tight.id)?.drifted).toBe(true)
    expect(byId.get(closed.id)?.seats).toEqual({ paid: 1, used: 2 })
    expect(byId.get(closed.id)?.drifted).toBe(false)

    expect(adrift.json.total).toBe(1)
    expect(adrift.json.data.map((row) => row.id)).toEqual([tight.id])
    expect(covered.json.data.map((row) => row.id)).toContain(closed.id)
    expect(covered.json.data.map((row) => row.id)).toContain(other.id)
    expect(covered.json.data.map((row) => row.id)).not.toContain(tight.id)
  })

  it("keeps every non-platform product under the stripe filter", async () => {
    const { organization } = await atelier()
    const granted = await subscribeOrganization({
      organizationId: organization.id,
      status: "canceled",
    })
    const { counted, dropped, other } = await twoOrganizations()
    const admin = await platformAdmin()

    await harness.prisma.subscription.update({
      where: { id: granted.id },
      data: { product: GRANTED_PRODUCT },
    })

    const stripe = await apiRequest<SubscriptionsBody>(
      "/admin/subscriptions?product=stripe",
      { session: admin }
    )
    const offered = await apiRequest<SubscriptionsBody>(
      `/admin/subscriptions?product=${GRANTED_PRODUCT}`,
      { session: admin }
    )

    expect(stripe.json.total).toBe(3)
    expect(stripe.json.data.map((row) => row.id).sort()).toEqual(
      [counted.id, dropped.id, other.id].sort()
    )
    expect(offered.json.data.map((row) => row.id)).toEqual([granted.id])
  })
})

describe("GET /admin/subscriptions/:id, seats, drift and Stripe", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    useFakeBilling()
  })

  it("counts the occupied seats, reports the drift and points to the Stripe dashboard", async () => {
    const { organization } = await atelier()
    const stripe = await subscribeOrganization({
      organizationId: organization.id,
      status: "active",
      quantity: 1,
    })

    await fillFreeServers(organization.id)
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

  it("does not drift when the seats cover, and has no Stripe address on a platform product", async () => {
    const { organization } = await atelier()
    const admin = await platformAdmin()
    const granted = await grant(organization.id, admin, { seats: 3 })

    await fillFreeServers(organization.id)
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

describe("the team's actions when billing is switched off", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    billing = useBillingOff()
  })

  afterAll(() => {
    useFakeBilling()
  })

  it("has no route left to extend a trial", async () => {
    const { organization } = await atelier()
    const stripe = await subscribeOrganization({
      organizationId: organization.id,
    })
    const admin = await platformAdmin()
    const response = await apiRequest<ErrorBody>(
      `/admin/subscriptions/${stripe.id}/trial`,
      {
        body: { ends_at: new Date(Date.now() + DAY_MS).toISOString() },
        session: admin,
      }
    )

    expect(response.status).toBe(404)
  })

  it("grants, resizes and stops a granted licence without Stripe", async () => {
    const { organization } = await atelier()
    const admin = await platformAdmin()
    const granted = await grant(organization.id, admin, { seats: 2 })
    const resized = await apiRequest<SubscriptionBody>(
      `/admin/subscriptions/${granted.json.data.id}`,
      { method: "PATCH", body: { seats: 4 }, session: admin }
    )
    const canceled = await apiRequest<SubscriptionBody>(
      `/admin/subscriptions/${granted.json.data.id}/cancel`,
      { body: { reason: "fin" }, session: admin }
    )

    expect(granted.status).toBe(201)
    expect(resized.json.data.quantity).toBe(4)
    expect(canceled.json.data.status).toBe("canceled")
    expect(billing.cancellations).toHaveLength(0)
  })

  it("refuses to stop or resume a Stripe row, without calling Stripe", async () => {
    const { organization } = await atelier()
    const stripe = await subscribeOrganization({
      organizationId: organization.id,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date(Date.now() + DAY_MS),
    })
    const admin = await platformAdmin()
    const canceled = await apiRequest<ErrorBody>(
      `/admin/subscriptions/${stripe.id}/cancel`,
      { body: { reason: "fin" }, session: admin }
    )
    const resumed = await apiRequest<ErrorBody>(
      `/admin/subscriptions/${stripe.id}/resume`,
      { method: "POST", session: admin }
    )

    for (const refused of [canceled, resumed]) {
      expect(refused.status).toBe(409)
      expect(refused.json.error.code).toBe("conflict")
      expect(refused.json.error.message).toContain("Stripe")
    }

    expect(billing.cancellations).toHaveLength(0)
    expect(billing.resumptions).toHaveLength(0)
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

  it("resumes the subscription at Stripe and the mirror stops announcing the end", async () => {
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

  it("refuses a subscription that is not ending, a stopped subscription and a platform product", async () => {
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

  it("refuses a missing subscription, a member and an anonymous user", async () => {
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
