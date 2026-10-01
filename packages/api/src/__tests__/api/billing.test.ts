import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { LEGAL_CONTACTS } from "@pupitre/shared/legal"
import { FREE_SERVERS, GRANTED_PRODUCT } from "@pupitre/shared/plans"
import type { FakeBilling } from "../../lib/billing/fake"
import { suspendExpiredGrace } from "../../lib/billing/grace"
import { GRACE_PERIOD_MS } from "../../lib/billing/license"
import { reconcileSeats } from "../../lib/billing/reconcile"
import { bootApiTestServer, resetDb } from "../../testing"
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
import { ED25519_KEY } from "../../testing/keys"
import { PROBE_REPORT } from "../../testing/probe"
import { apiRequest } from "../../testing/request"

interface Session {
  token: string
}

interface UrlBody {
  url: string
}

interface ErrorBody {
  error: { code: string; message: string; fix?: string }
}

interface StateBody {
  license: string
}

interface EventsBody {
  data: {
    action: string
    target_id: string
    payload: unknown
  }[]
}

interface SubscriptionBody {
  data: {
    quantity: number
    status: string
    product: string
    interval: string | null
    current_period_end: string | null
  } | null
}

function checkoutSessionObject(organizationId: string) {
  return {
    id: "cs_test_seat",
    object: "checkout.session",
    mode: "subscription",
    customer: "cus_seat",
    subscription: "sub_seat",
    client_reference_id: organizationId,
    metadata: { organization_id: organizationId },
  }
}

async function paySeats(
  billing: FakeBilling,
  organizationId: string,
  quantity: number,
  status = "active"
) {
  billing.put(
    remoteSubscription({
      id: "sub_seat",
      customerId: "cus_seat",
      organizationId,
      quantity,
      status,
    })
  )

  return await postStripeWebhook(
    stripeEvent(
      "checkout.session.completed",
      checkoutSessionObject(organizationId)
    )
  )
}

function addDevice(session: Session, name: string) {
  return apiRequest<{ data: { id: string } }>("/me/devices", {
    body: { name, public_key: ED25519_KEY },
    session,
  })
}

function enroll(session: Session, deviceId: string, host: string) {
  return apiRequest<
    ErrorBody & { server_id: string; enrollment_token: string }
  >("/servers/enroll", {
    body: { device_id: deviceId, host, probe: PROBE_REPORT },
    session,
  })
}

async function enrollMany(session: Session, count: number, prefix: string) {
  const device = await addDevice(session, "poste")
  const statuses: number[] = []

  for (let index = 1; index <= count; index += 1) {
    const enrolled = await enroll(
      session,
      device.json.data.id,
      `${prefix}-${index}.example.net`
    )

    statuses.push(enrolled.status)
  }

  return { deviceId: device.json.data.id, statuses }
}

describe("facturation d'une organisation", () => {
  let billing: FakeBilling
  let organizationId: string
  let owner: Session
  let admin: Session
  let member: Session

  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    billing = useFakeBilling()

    const created = await createOrganizationWithMembers()

    organizationId = created.organization.id
    owner = created.members[0].session
    admin = created.members[1].session
    member = created.members[2].session
  })

  it("ouvre un checkout sans essai, à la quantité demandée", async () => {
    const response = await apiRequest<UrlBody>(
      `/orgs/${organizationId}/checkout`,
      { body: { quantity: 3, interval: "month" }, session: owner }
    )

    expect(response.status).toBe(200)
    expect(response.json.url).toStartWith("https://checkout.stripe.test/")
    expect(billing.checkouts).toHaveLength(1)
    expect(billing.checkouts[0]).toMatchObject({
      organizationId,
      quantity: 3,
      interval: "month",
      customerId: null,
    })
    expect(billing.checkouts[0]).not.toHaveProperty("trialDays")
  })

  it("reprend le client Stripe connu d'un abonnement arrêté", async () => {
    await paySeats(billing, organizationId, 2, "canceled")

    await apiRequest(`/orgs/${organizationId}/checkout`, {
      body: { quantity: 3, interval: "month" },
      session: owner,
    })

    expect(billing.checkouts[0]).toMatchObject({
      quantity: 3,
      customerId: "cus_seat",
    })
  })

  it("refuse un second checkout tant qu'un abonnement payé court, vers les sièges ou le portail", async () => {
    await paySeats(billing, organizationId, 2)

    const response = await apiRequest<ErrorBody>(
      `/orgs/${organizationId}/checkout`,
      { body: { quantity: 3, interval: "month" }, session: owner }
    )

    expect(response.status).toBe(409)
    expect(response.json.error.code).toBe("conflict")
    expect(response.json.error.fix).toContain(`/orgs/${organizationId}/seats`)
    expect(response.json.error.fix).toContain("portal")
    expect(billing.checkouts).toHaveLength(0)
  })

  it("ouvre un checkout annuel", async () => {
    await apiRequest(`/orgs/${organizationId}/checkout`, {
      body: { quantity: 1, interval: "year" },
      session: owner,
    })

    expect(billing.checkouts[0]).toMatchObject({
      quantity: 1,
      interval: "year",
    })
  })

  it("ramène le checkout sur la facturation par défaut", async () => {
    await apiRequest(`/orgs/${organizationId}/checkout`, {
      body: { quantity: 1, interval: "month" },
      session: owner,
    })

    expect(billing.checkouts[0]).toMatchObject({
      successUrl: "http://localhost:3000/dashboard/billing?checkout=done",
      cancelUrl: "http://localhost:3000/dashboard/billing?checkout=cancelled",
    })
  })

  it("ramène le checkout sur l'onboarding quand il en vient", async () => {
    await apiRequest(`/orgs/${organizationId}/checkout`, {
      body: { quantity: 1, interval: "month", return_to: "start" },
      session: owner,
    })

    expect(billing.checkouts[0]).toMatchObject({
      successUrl: "http://localhost:3000/dashboard/start?checkout=done",
      cancelUrl: "http://localhost:3000/dashboard/start?checkout=cancelled",
    })
  })

  it("refuse une destination de retour inconnue", async () => {
    const response = await apiRequest<ErrorBody>(
      `/orgs/${organizationId}/checkout`,
      {
        body: {
          quantity: 1,
          interval: "month",
          return_to: "https://ailleurs.test",
        },
        session: owner,
      }
    )

    expect(response.status).toBe(422)
    expect(billing.checkouts).toHaveLength(0)
  })

  it("réserve le checkout au propriétaire", async () => {
    const byAdmin = await apiRequest<ErrorBody>(
      `/orgs/${organizationId}/checkout`,
      { body: { quantity: 1, interval: "month" }, session: admin }
    )
    const byMember = await apiRequest<ErrorBody>(
      `/orgs/${organizationId}/checkout`,
      { body: { quantity: 1, interval: "month" }, session: member }
    )
    const anonymous = await apiRequest<ErrorBody>(
      `/orgs/${organizationId}/checkout`,
      { body: { quantity: 1, interval: "month" } }
    )

    expect(byAdmin.status).toBe(403)
    expect(byAdmin.json.error.code).toBe("forbidden")
    expect(byMember.status).toBe(403)
    expect(anonymous.status).toBe(401)
  })

  it("ignore une organisation qui n'est pas l'active", async () => {
    const other = await createOrganizationWithMembers({ roles: ["owner"] })
    const response = await apiRequest<ErrorBody>(
      `/orgs/${other.organization.id}/checkout`,
      { body: { quantity: 1, interval: "month" }, session: owner }
    )

    expect(response.status).toBe(404)
    expect(response.json.error.code).toBe("not_found")
  })

  it("refuse le portail sans client Stripe, avec un remède", async () => {
    const response = await apiRequest<ErrorBody>(
      `/orgs/${organizationId}/portal`,
      { method: "POST", session: owner }
    )

    expect(response.status).toBe(409)
    expect(response.json.error.code).toBe("conflict")
    expect(response.json.error.fix).toContain("checkout")
  })

  it("ouvre le portail une fois le client connu", async () => {
    await paySeats(billing, organizationId, 2)

    const response = await apiRequest<UrlBody>(
      `/orgs/${organizationId}/portal`,
      { method: "POST", session: owner }
    )

    expect(response.status).toBe(200)
    expect(response.json.url).toStartWith("https://billing.stripe.test/")
    expect(billing.portals[0].customerId).toBe("cus_seat")
  })

  it("montre le miroir de l'abonnement", async () => {
    const before = await apiRequest<SubscriptionBody>(
      `/orgs/${organizationId}/subscription`,
      { session: owner }
    )

    expect(before.status).toBe(200)
    expect(before.json.data).toBeNull()

    await paySeats(billing, organizationId, 4)

    const after = await apiRequest<SubscriptionBody>(
      `/orgs/${organizationId}/subscription`,
      { session: owner }
    )

    expect(after.json.data).toMatchObject({
      quantity: 4,
      status: "active",
      product: "prod_server",
      interval: "month",
    })
  })

  it("ajoute les sièges payés aux serveurs gratuits, et refuse le suivant", async () => {
    await paySeats(billing, organizationId, 2)

    const { statuses } = await enrollMany(owner, FREE_SERVERS + 3, "vps")

    expect(statuses.at(-1)).toBe(403)
    expect(statuses.slice(0, -1).every((status) => status === 201)).toBe(true)
  })

  it("passe en tolérance au-delà des serveurs gratuits quand l'abonnement s'arrête, puis suspend, puis rétablit une fois revenu aux serveurs gratuits", async () => {
    await paySeats(billing, organizationId, 1)

    const servers: Awaited<ReturnType<typeof createServer>>[] = []

    for (let index = 0; index <= FREE_SERVERS; index += 1) {
      servers.push(await createServer({ organizationId }))
    }

    const endedAt = new Date(Date.now() - 60_000)

    billing.put(
      remoteSubscription({
        id: "sub_seat",
        customerId: "cus_seat",
        organizationId,
        quantity: 1,
        status: "canceled",
        currentPeriodEnd: endedAt,
      })
    )

    await postStripeWebhook(
      stripeEvent(
        "customer.subscription.deleted",
        stripeSubscriptionObject({
          id: "sub_seat",
          customerId: "cus_seat",
          organizationId,
          quantity: 1,
          status: "canceled",
          currentPeriodEnd: endedAt,
        })
      )
    )

    const bearer = servers[0]?.token ?? ""
    const inGrace = await apiRequest<StateBody>("/agent/state", { bearer })

    expect(inGrace.json.license).toBe("grace")

    const afterGrace = new Date(Date.now() + GRACE_PERIOD_MS + 60_000)

    expect(await suspendExpiredGrace(afterGrace)).toHaveLength(FREE_SERVERS + 1)

    const suspended = await apiRequest<StateBody>("/agent/state", { bearer })

    expect(suspended.json.license).toBe("suspended")

    const device = await addDevice(owner, "poste")
    const refused = await enroll(
      owner,
      device.json.data.id,
      "vps-2.example.net"
    )

    expect(refused.status).toBe(403)
    expect(refused.json.error.code).toBe("license_required")
    expect(refused.json.error.fix).toContain(LEGAL_CONTACTS.support)

    const removed = await apiRequest(`/servers/${servers.at(-1)?.server.id}`, {
      method: "DELETE",
      session: owner,
    })

    expect(removed.status).toBe(204)

    const restored = await apiRequest<StateBody>("/agent/state", { bearer })

    expect(restored.json.license).toBe("valid")
  })

  it("compare les sièges payés aux serveurs au-delà des gratuits", async () => {
    await paySeats(billing, organizationId, 4)
    await enrollMany(owner, FREE_SERVERS + 1, "vps")

    const report = await reconcileSeats()

    expect(report).toHaveLength(1)
    expect(report[0]).toMatchObject({
      organization_id: organizationId,
      paid: 4,
      seated: 1,
      drift: -3,
      applied: false,
    })
    expect(billing.quantities).toHaveLength(0)
  })

  it("aligne la quantité Stripe quand on le demande", async () => {
    await paySeats(billing, organizationId, 4)
    await enrollMany(owner, FREE_SERVERS + 1, "vps")

    const report = await reconcileSeats({ apply: true })

    expect(report[0].applied).toBe(true)
    expect(billing.quantities).toEqual([
      { subscriptionId: "sub_seat", quantity: 1 },
    ])

    const after = await apiRequest<SubscriptionBody>(
      `/orgs/${organizationId}/subscription`,
      { session: owner }
    )

    expect(after.json.data?.quantity).toBe(1)
  })

  it("verrouille les sièges d'une licence accordée par l'équipe", async () => {
    const { prisma } = await bootApiTestServer()

    await prisma.subscription.create({
      data: {
        organizationId,
        stripeSubscriptionId: "granted_equipe",
        product: GRANTED_PRODUCT,
        quantity: 2,
        status: "active",
      },
    })

    const refused = await apiRequest<ErrorBody>(
      `/orgs/${organizationId}/seats`,
      { body: { quantity: 3 }, session: owner, locale: "fr" }
    )

    expect(refused.status).toBe(409)
    expect(refused.json.error.code).toBe("conflict")
    expect(refused.json.error.message).toContain("licence")
    expect(refused.json.error.fix).toContain(LEGAL_CONTACTS.support)
    expect(billing.quantities).toHaveLength(0)
  })

  it("ajoute un siège une fois l'abonnement payé, et l'enrôlement suivant passe", async () => {
    await paySeats(billing, organizationId, 1)

    const { deviceId, statuses } = await enrollMany(
      owner,
      FREE_SERVERS + 2,
      "paid"
    )

    expect(statuses.at(-1)).toBe(403)

    const resized = await apiRequest<SubscriptionBody>(
      `/orgs/${organizationId}/seats`,
      { body: { quantity: 2 }, session: owner }
    )

    expect(resized.status).toBe(200)
    expect(resized.json.data).toMatchObject({ quantity: 2, status: "active" })
    expect(billing.quantities).toEqual([
      { subscriptionId: "sub_seat", quantity: 2 },
    ])
    expect(
      (await enroll(owner, deviceId, `paid-${FREE_SERVERS + 2}.example.net`))
        .status
    ).toBe(201)
  })

  it("garde la trace du changement dans le journal", async () => {
    await paySeats(billing, organizationId, 1)
    await apiRequest(`/orgs/${organizationId}/seats`, {
      body: { quantity: 3 },
      session: owner,
    })

    const events = await apiRequest<EventsBody>(
      `/orgs/${organizationId}/events?action=subscription.updated`,
      { session: owner }
    )

    expect(events.json.data[0]).toMatchObject({
      action: "subscription.updated",
      target_id: "sub_seat",
      payload: { quantity: 3, previous: 1 },
    })
  })

  it("descend jusqu'aux serveurs en place au-delà des gratuits, jamais en dessous", async () => {
    await paySeats(billing, organizationId, 4)
    await enrollMany(owner, FREE_SERVERS + 2, "vps")

    const lowered = await apiRequest<SubscriptionBody>(
      `/orgs/${organizationId}/seats`,
      { body: { quantity: 2 }, session: owner }
    )

    expect(lowered.status).toBe(200)
    expect(lowered.json.data?.quantity).toBe(2)

    const refused = await apiRequest<ErrorBody>(
      `/orgs/${organizationId}/seats`,
      { body: { quantity: 1 }, session: owner }
    )

    expect(refused.status).toBe(409)
    expect(refused.json.error.code).toBe("conflict")
    expect(refused.json.error.message).toContain("2")
    expect(refused.json.error.fix).toContain("servers")
    expect(billing.quantities).toHaveLength(1)
  })

  it("refuse de changer les sièges sans licence en cours, vers le support", async () => {
    const response = await apiRequest<ErrorBody>(
      `/orgs/${organizationId}/seats`,
      { body: { quantity: 2 }, session: owner }
    )

    expect(response.status).toBe(409)
    expect(response.json.error.code).toBe("conflict")
    expect(response.json.error.fix).toContain(LEGAL_CONTACTS.support)
  })

  it("réserve le changement de sièges au propriétaire", async () => {
    await paySeats(billing, organizationId, 2)

    const byAdmin = await apiRequest<ErrorBody>(
      `/orgs/${organizationId}/seats`,
      { body: { quantity: 3 }, session: admin }
    )
    const byMember = await apiRequest<ErrorBody>(
      `/orgs/${organizationId}/seats`,
      { body: { quantity: 3 }, session: member }
    )
    const anonymous = await apiRequest<ErrorBody>(
      `/orgs/${organizationId}/seats`,
      { body: { quantity: 3 } }
    )
    const other = await createOrganizationWithMembers({ roles: ["owner"] })
    const elsewhere = await apiRequest<ErrorBody>(
      `/orgs/${other.organization.id}/seats`,
      { body: { quantity: 3 }, session: owner }
    )

    expect(byAdmin.status).toBe(403)
    expect(byMember.status).toBe(403)
    expect(anonymous.status).toBe(401)
    expect(elsewhere.status).toBe(404)
    expect(billing.quantities).toHaveLength(0)
  })

  it("borne la quantité demandée", async () => {
    await paySeats(billing, organizationId, 2)

    const none = await apiRequest<ErrorBody>(`/orgs/${organizationId}/seats`, {
      body: { quantity: 0 },
      session: owner,
    })
    const tooMany = await apiRequest<ErrorBody>(
      `/orgs/${organizationId}/seats`,
      { body: { quantity: 501 }, session: owner }
    )

    expect(none.status).toBe(422)
    expect(tooMany.status).toBe(422)
    expect(billing.quantities).toHaveLength(0)
  })

  it("ne réconcilie rien sans abonnement", async () => {
    expect(await reconcileSeats()).toEqual([])
  })
})
