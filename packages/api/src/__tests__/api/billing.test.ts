import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import type { FakeBilling } from "../../lib/billing/fake"
import { suspendExpiredGrace } from "../../lib/billing/grace"
import { reconcileSeats } from "../../lib/billing/reconcile"
import { bootApiTestServer, resetDb } from "../../testing"
import {
  postStripeWebhook,
  remoteSubscription,
  stripeEvent,
  stripeSubscriptionObject,
  useFakeBilling,
} from "../../testing/billing"
import { createOrganizationWithMembers } from "../../testing/factories"
import { ED25519_KEY } from "../../testing/keys"
import { HOST_PUBLIC_KEY, PROBE_REPORT } from "../../testing/probe"
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

interface MeBody {
  entitlement: string
}

interface StateBody {
  entitlement: string
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

  it("ouvre un checkout en quantité, mensuel", async () => {
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

  it("ouvre deux sièges payés et refuse le troisième vers le portail", async () => {
    await paySeats(billing, organizationId, 2)

    const device = await addDevice(owner, "poste")
    const deviceId = device.json.data.id
    const first = await enroll(owner, deviceId, "vps-1.example.net")
    const second = await enroll(owner, deviceId, "vps-2.example.net")
    const third = await enroll(owner, deviceId, "vps-3.example.net")

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(third.status).toBe(403)
    expect(third.json.error.code).toBe("seat_quota_reached")
    expect(third.json.error.message).toContain("2")
    expect(third.json.error.fix).toContain("seats")
    expect(third.json.error.fix).toContain(organizationId)
  })

  it("sans aucun abonnement, suspend le droit d'usage et refuse l'enrôlement", async () => {
    const me = await apiRequest<MeBody>("/me", { session: owner })

    expect(me.json.entitlement).toBe("suspended")

    const device = await addDevice(owner, "poste")
    const refused = await enroll(
      owner,
      device.json.data.id,
      "dev-1.example.net"
    )

    expect(refused.status).toBe(403)
    expect(refused.json.error.code).toBe("entitlement_required")
    expect(refused.json.error.fix).toContain("/dashboard/billing")
  })

  it("enrôle jusqu'à la quantité de l'essai, puis refuse la suivante", async () => {
    await paySeats(billing, organizationId, 2, "trialing")

    const me = await apiRequest<MeBody>("/me", { session: owner })

    expect(me.json.entitlement).toBe("valid")

    const device = await addDevice(owner, "poste")
    const deviceId = device.json.data.id

    expect((await enroll(owner, deviceId, "trial-1.example.net")).status).toBe(
      201
    )
    expect((await enroll(owner, deviceId, "trial-2.example.net")).status).toBe(
      201
    )

    const refused = await enroll(owner, deviceId, "trial-3.example.net")

    expect(refused.status).toBe(403)
    expect(refused.json.error.code).toBe("seat_quota_reached")
    expect(refused.json.error.message).toContain("2")
  })

  it("coupe l'accès quand l'essai se termine sans carte", async () => {
    await paySeats(billing, organizationId, 1, "trialing")

    const device = await addDevice(owner, "poste")
    const enrolled = await enroll(owner, device.json.data.id, "vps.example.net")

    expect(enrolled.status).toBe(201)

    const exchanged = await apiRequest<{ server_token: string }>(
      "/agent/exchange",
      {
        body: {
          enrollment_token: enrolled.json.enrollment_token,
          host_public_key: HOST_PUBLIC_KEY,
          agent_version: "1.4.0",
          arch: "amd64",
        },
      }
    )
    const trialEnd = new Date(Date.now() - 60_000)

    billing.put(
      remoteSubscription({
        id: "sub_seat",
        customerId: "cus_seat",
        organizationId,
        quantity: 1,
        status: "canceled",
        currentPeriodEnd: trialEnd,
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
          currentPeriodEnd: trialEnd,
        })
      )
    )

    const inGrace = await apiRequest<StateBody>("/agent/state", {
      bearer: exchanged.json.server_token,
    })

    expect(inGrace.json.entitlement).toBe("grace")

    expect(await suspendExpiredGrace(new Date())).toHaveLength(1)

    const suspended = await apiRequest<StateBody>("/agent/state", {
      bearer: exchanged.json.server_token,
    })

    expect(suspended.json.entitlement).toBe("suspended")

    const refused = await enroll(
      owner,
      device.json.data.id,
      "vps-2.example.net"
    )

    expect(refused.status).toBe(403)
    expect(refused.json.error.code).toBe("server_suspended")
    expect(refused.json.error.fix).toContain("/dashboard/billing")
  })

  it("compare les sièges payés et les serveurs actifs", async () => {
    await paySeats(billing, organizationId, 4)

    const device = await addDevice(owner, "poste")

    await enroll(owner, device.json.data.id, "vps-1.example.net")

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

    const device = await addDevice(owner, "poste")

    await enroll(owner, device.json.data.id, "vps-1.example.net")

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

  it("ajoute un siège en cours d'essai, et l'enrôlement suivant passe", async () => {
    await paySeats(billing, organizationId, 1, "trialing")

    const device = await addDevice(owner, "poste")
    const deviceId = device.json.data.id

    expect((await enroll(owner, deviceId, "trial-1.example.net")).status).toBe(
      201
    )
    expect((await enroll(owner, deviceId, "trial-2.example.net")).status).toBe(
      403
    )

    const resized = await apiRequest<SubscriptionBody>(
      `/orgs/${organizationId}/seats`,
      { body: { quantity: 2 }, session: owner }
    )

    expect(resized.status).toBe(200)
    expect(resized.json.data).toMatchObject({ quantity: 2, status: "trialing" })
    expect(billing.quantities).toEqual([
      { subscriptionId: "sub_seat", quantity: 2 },
    ])
    expect((await enroll(owner, deviceId, "trial-2.example.net")).status).toBe(
      201
    )
  })

  it("garde la trace du changement dans le journal", async () => {
    await paySeats(billing, organizationId, 1, "trialing")
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

  it("descend jusqu'aux serveurs en place, jamais en dessous", async () => {
    await paySeats(billing, organizationId, 4)

    const device = await addDevice(owner, "poste")

    await enroll(owner, device.json.data.id, "vps-1.example.net")
    await enroll(owner, device.json.data.id, "vps-2.example.net")

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

  it("refuse de changer les sièges sans abonnement en cours", async () => {
    const response = await apiRequest<ErrorBody>(
      `/orgs/${organizationId}/seats`,
      { body: { quantity: 2 }, session: owner }
    )

    expect(response.status).toBe(409)
    expect(response.json.error.code).toBe("conflict")
    expect(response.json.error.fix).toContain("/dashboard/billing")
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
