import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { LAUNCH_PRODUCT, LAUNCH_SEATS } from "@pupitre/shared/plans"
import { PLATFORM_ORGANIZATION_ID } from "@pupitre/shared/platform"
import type { FakeBilling } from "../../lib/billing/fake"
import { suspendExpiredGrace } from "../../lib/billing/grace"
import {
  grantLaunchSubscription,
  launchSubscriptionId,
  reconcileLaunch,
} from "../../lib/billing/launch"
import { type ApiTestServer, bootApiTestServer, resetDb } from "../../testing"
import {
  TEST_LAUNCH_END,
  useFakeBilling,
  useLaunchBilling,
} from "../../testing/billing"
import {
  createOrganizationWithMembers,
  createServer,
  subscribeOrganization,
} from "../../testing/factories"
import { ED25519_KEY } from "../../testing/keys"
import { PROBE_REPORT } from "../../testing/probe"
import { apiRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

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
  subscription: { status: string; trial_ends_at: string | null } | null
}

interface SubscriptionBody {
  data: { product: string; quantity: number; status: string } | null
}

interface StatusBody {
  data: { billing: { mode: string; launch_ends_at: string | null } }
}

const DAY_MS = 86_400_000

function checkout(organizationId: string, session: Session, extra = {}) {
  return apiRequest<UrlBody>(`/orgs/${organizationId}/checkout`, {
    body: { quantity: 5, interval: "month", ...extra },
    session,
  })
}

async function registerDevice(session: Session): Promise<string> {
  const device = await apiRequest<{ data: { id: string } }>("/me/devices", {
    body: { name: "poste", public_key: ED25519_KEY },
    session,
  })

  return device.json.data.id
}

function enrollHost(session: Session, deviceId: string, host: string) {
  return apiRequest<ErrorBody>("/servers/enroll", {
    body: { device_id: deviceId, host, probe: PROBE_REPORT },
    session,
  })
}

describe("le lancement", () => {
  let harness: ApiTestServer
  let billing: FakeBilling
  let organizationId: string
  let owner: Session & { user: { id: string } }

  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    billing = useLaunchBilling()

    const created = await createOrganizationWithMembers({ roles: ["owner"] })

    organizationId = created.organization.id
    owner = { token: created.members[0].token, user: created.members[0].user }
  })

  afterAll(() => {
    useFakeBilling()
  })

  it("accorde l'abonnement sans Stripe et ramène sur la console comme un checkout terminé", async () => {
    const response = await checkout(organizationId, owner, {
      return_to: "start",
    })

    expect(response.status).toBe(200)
    expect(response.json.url).toBe(
      "http://localhost:3000/dashboard/start?checkout=done"
    )
    expect(billing.checkouts).toHaveLength(0)

    const stored = await harness.prisma.subscription.findUniqueOrThrow({
      where: { stripeSubscriptionId: launchSubscriptionId(organizationId) },
    })

    expect(stored).toMatchObject({
      organizationId,
      product: LAUNCH_PRODUCT,
      quantity: LAUNCH_SEATS,
      status: "trialing",
      currentPeriodEnd: TEST_LAUNCH_END,
    })

    const event = await harness.prisma.event.findFirstOrThrow({
      where: { action: "subscription.created", organizationId },
    })

    expect(event.actorUserId).toBe(owner.user.id)
    expect(event.targetId).toBe(stored.stripeSubscriptionId)

    const mirror = await apiRequest<SubscriptionBody>(
      `/orgs/${organizationId}/subscription`,
      { session: owner }
    )

    expect(mirror.json.data).toMatchObject({
      product: LAUNCH_PRODUCT,
      status: "trialing",
    })

    const me = await apiRequest<MeBody>("/me", { session: owner })

    expect(me.json.entitlement).toBe("valid")
    expect(me.json.subscription?.trial_ends_at).toBe(
      TEST_LAUNCH_END.toISOString()
    )
  })

  it("ne crée l'abonnement qu'une fois", async () => {
    await checkout(organizationId, owner)

    const again = await checkout(organizationId, owner)

    expect(again.status).toBe(200)
    expect(
      await harness.prisma.subscription.count({ where: { organizationId } })
    ).toBe(1)
    expect(
      await harness.prisma.event.count({
        where: { action: "subscription.created", organizationId },
      })
    ).toBe(1)
  })

  it("laisse tranquille un abonnement Stripe encore en cours", async () => {
    await subscribeOrganization({
      organizationId,
      status: "active",
      quantity: 3,
    })

    const response = await checkout(organizationId, owner)

    expect(response.status).toBe(200)
    expect(
      await harness.prisma.subscription.count({ where: { organizationId } })
    ).toBe(1)
  })

  it("tient l'organisation Pupitre pour entitled sans aucun abonnement, avec les sièges d'équipe", async () => {
    const { user, organization } = await createUser({
      email: "support@pupitre.studio",
      role: "platform_admin",
    })
    const onPlatform = await createSession({
      userId: user.id,
      activeOrganizationId: PLATFORM_ORGANIZATION_ID,
    })

    const me = await apiRequest<MeBody>("/me", { session: onPlatform })

    expect(me.json.entitlement).toBe("valid")
    expect(me.json.subscription).toBeNull()

    const deviceId = await registerDevice(onPlatform)
    const first = await enrollHost(onPlatform, deviceId, "team-1.example.net")

    expect(first.status).toBe(201)
    expect(
      await harness.prisma.subscription.count({
        where: { organizationId: PLATFORM_ORGANIZATION_ID },
      })
    ).toBe(0)

    const personal = await createSession({ userId: user.id })
    const asPerson = await apiRequest<MeBody>("/me", { session: personal })

    expect(asPerson.json.entitlement).toBe("suspended")

    await checkout(organization.id, personal)

    expect(
      (
        await harness.prisma.subscription.findUniqueOrThrow({
          where: {
            stripeSubscriptionId: launchSubscriptionId(organization.id),
          },
        })
      ).quantity
    ).toBe(LAUNCH_SEATS)
  })

  it("lit le nombre de sièges d'équipe dans la configuration", async () => {
    useLaunchBilling({ adminSeats: 1 })

    const { user } = await createUser({
      email: "team@pupitre.studio",
      role: "platform_admin",
    })
    const onPlatform = await createSession({
      userId: user.id,
      activeOrganizationId: PLATFORM_ORGANIZATION_ID,
    })
    const deviceId = await registerDevice(onPlatform)
    const first = await enrollHost(onPlatform, deviceId, "team-1.example.net")
    const second = await enrollHost(onPlatform, deviceId, "team-2.example.net")

    expect(first.status).toBe(201)
    expect(second.status).toBe(403)
    expect(second.json.error.code).toBe("seat_quota_reached")
  })

  it("enrôle une machine, et refuse la seconde", async () => {
    await checkout(organizationId, owner)

    const deviceId = await registerDevice(owner)
    const first = await enrollHost(owner, deviceId, "vps-1.example.net")
    const second = await enrollHost(owner, deviceId, "vps-2.example.net")

    expect(first.status).toBe(201)
    expect(second.status).toBe(403)
    expect(second.json.error.code).toBe("seat_quota_reached")
  })

  it("verrouille les sièges pendant le lancement", async () => {
    await checkout(organizationId, owner)

    const response = await apiRequest<ErrorBody>(
      `/orgs/${organizationId}/seats`,
      { body: { quantity: 3 }, session: owner, locale: "fr" }
    )

    expect(response.status).toBe(409)
    expect(response.json.error.code).toBe("conflict")
    expect(response.json.error.message).toContain("lancement")
    expect(response.json.error.fix).toBeString()
    expect(billing.quantities).toHaveLength(0)
  })

  it("refuse le portail : il n'y a pas de client Stripe à montrer", async () => {
    await checkout(organizationId, owner)

    const response = await apiRequest<ErrorBody>(
      `/orgs/${organizationId}/portal`,
      { method: "POST", session: owner, locale: "fr" }
    )

    expect(response.status).toBe(409)
    expect(response.json.error.code).toBe("conflict")
    expect(response.json.error.message).toContain("lancement")
    expect(billing.portals).toHaveLength(0)
  })

  it("aligne la fin des abonnements sur la date configurée", async () => {
    await checkout(organizationId, owner)

    const drifted = new Date(TEST_LAUNCH_END.getTime() - 30 * DAY_MS)

    await harness.prisma.subscription.updateMany({
      where: { organizationId },
      data: { currentPeriodEnd: drifted },
    })

    const report = await reconcileLaunch(new Date())
    const stored = await harness.prisma.subscription.findFirstOrThrow({
      where: { organizationId },
    })

    expect(report.aligned).toEqual([stored.id])
    expect(report.canceled).toEqual([])
    expect(stored.currentPeriodEnd).toEqual(TEST_LAUNCH_END)
    expect(await reconcileLaunch(new Date())).toEqual({
      aligned: [],
      canceled: [],
    })
  })

  it("ferme un lancement dépassé et met ses serveurs en tolérance jusqu'à sa fin, que la suspension ferme le jour même", async () => {
    await checkout(organizationId, owner)

    const { server } = await createServer({ organizationId })
    const ended = new Date(Date.now() - DAY_MS)

    useLaunchBilling({ endsAt: ended })

    const now = new Date()
    const report = await reconcileLaunch(now)
    const subscription = await harness.prisma.subscription.findFirstOrThrow({
      where: { organizationId },
    })

    expect(report.canceled).toEqual([subscription.id])
    expect(subscription.status).toBe("canceled")
    expect(
      await harness.prisma.event.count({
        where: { action: "subscription.canceled", organizationId },
      })
    ).toBe(1)

    const graced = await harness.prisma.server.findUniqueOrThrow({
      where: { id: server.id },
    })

    expect(graced.status).toBe("grace")
    expect(graced.entitlementValidUntil).toEqual(ended)

    expect(await suspendExpiredGrace(now)).toEqual([server.id])

    const me = await apiRequest<MeBody>("/me", { session: owner })

    expect(me.json.entitlement).toBe("suspended")
  })

  it("dit le mode et la fin du lancement sur /status", async () => {
    const launch = await apiRequest<StatusBody>("/status")

    expect(launch.json.data.billing).toEqual({
      mode: "launch",
      launch_ends_at: TEST_LAUNCH_END.toISOString(),
    })

    useFakeBilling()

    const stripe = await apiRequest<StatusBody>("/status")

    expect(stripe.json.data.billing).toEqual({
      mode: "stripe",
      launch_ends_at: null,
    })
  })

  it("ne garde qu'une ligne de création quand deux octrois partent ensemble", async () => {
    await Promise.all([
      grantLaunchSubscription({ organizationId, userId: owner.user.id }),
      grantLaunchSubscription({ organizationId, userId: owner.user.id }),
    ])

    const created = await harness.prisma.event.count({
      where: { action: "subscription.created", organizationId },
    })

    expect(created).toBe(1)
    expect(
      await harness.prisma.subscription.count({ where: { organizationId } })
    ).toBe(1)
  })
})

describe("la fin d'un lancement, une fois Stripe branché", () => {
  let harness: ApiTestServer

  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    useFakeBilling()
  })

  it("laisse les serveurs actifs quand l'organisation paie déjà chez Stripe", async () => {
    const { organization } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const { server } = await createServer({ organizationId: organization.id })
    const ended = new Date(Date.now() - DAY_MS)

    await harness.prisma.subscription.create({
      data: {
        organizationId: organization.id,
        stripeSubscriptionId: launchSubscriptionId(organization.id),
        product: LAUNCH_PRODUCT,
        quantity: LAUNCH_SEATS,
        status: "trialing",
        currentPeriodEnd: ended,
        updatedAt: ended,
      },
    })
    await subscribeOrganization({
      organizationId: organization.id,
      status: "active",
    })

    const report = await reconcileLaunch(new Date())
    const launch = await harness.prisma.subscription.findUniqueOrThrow({
      where: { stripeSubscriptionId: launchSubscriptionId(organization.id) },
    })

    expect(report.canceled).toEqual([launch.id])
    expect(launch.status).toBe("canceled")
    expect(
      await harness.prisma.event.count({
        where: {
          action: "subscription.canceled",
          organizationId: organization.id,
        },
      })
    ).toBe(1)

    const untouched = await harness.prisma.server.findUniqueOrThrow({
      where: { id: server.id },
    })

    expect(untouched.status).toBe("active")
  })
})
