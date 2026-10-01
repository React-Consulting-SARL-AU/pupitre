import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { LEGAL_CONTACTS } from "@pupitre/shared/legal"
import {
  FREE_SERVERS,
  PLATFORM_ORGANIZATION_SEATS,
} from "@pupitre/shared/plans"
import { PLATFORM_ORGANIZATION_ID } from "@pupitre/shared/platform"
import type { FakeBilling } from "../../lib/billing/fake"
import { suspendExpiredGrace } from "../../lib/billing/grace"
import {
  GRACE_PERIOD_MS,
  licenseForOrganization,
} from "../../lib/billing/license"
import { type ApiTestServer, bootApiTestServer, resetDb } from "../../testing"
import {
  postStripeWebhook,
  stripeEvent,
  stripeSubscriptionObject,
  useBillingOff,
  useFakeBilling,
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

interface ErrorBody {
  error: { code: string; message: string; fix?: string }
}

interface MeBody {
  license: string
  servers: { used: number; limit: number } | null
  license_grant: {
    status: string
    seats: number
    current_period_end: string | null
  } | null
  entitlement: string
  subscription: null
}

const DAY_MS = 86_400_000

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

async function enrollUpTo(session: Session, count: number) {
  const deviceId = await registerDevice(session)
  const responses: Awaited<ReturnType<typeof enrollHost>>[] = []

  for (let index = 1; index <= count; index += 1) {
    responses.push(
      await enrollHost(session, deviceId, `vps-${index}.example.net`)
    )
  }

  return { deviceId, responses }
}

async function platformAdmin() {
  const { user } = await createUser({
    email: "support@pupitre.studio",
    role: "platform_admin",
  })

  return await createSession({ userId: user.id })
}

describe("la licence d'une organisation", () => {
  let harness: ApiTestServer
  let billing: FakeBilling
  let organizationId: string
  let owner: Session

  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    billing = useBillingOff()

    const created = await createOrganizationWithMembers({ roles: ["owner"] })

    organizationId = created.organization.id
    owner = created.members[0].session
  })

  afterAll(() => {
    useFakeBilling()
  })

  it("enrôle les serveurs gratuits sans carte ni licence, et refuse le suivant vers le support", async () => {
    const { responses } = await enrollUpTo(owner, FREE_SERVERS + 1)
    const refused = responses.at(-1)

    expect(responses.slice(0, FREE_SERVERS).map((r) => r.status)).toEqual(
      Array.from({ length: FREE_SERVERS }, () => 201)
    )
    expect(refused?.status).toBe(403)
    expect(refused?.json.error.code).toBe("seat_quota_reached")
    expect(refused?.json.error.message).toContain(String(FREE_SERVERS))
    expect(refused?.json.error.fix).toContain(LEGAL_CONTACTS.support)
    expect(billing.checkouts).toHaveLength(0)
  })

  it("dit les serveurs gratuits dans les deux langues", async () => {
    const { deviceId } = await enrollUpTo(owner, FREE_SERVERS)
    const french = await apiRequest<ErrorBody>("/servers/enroll", {
      body: {
        device_id: deviceId,
        host: "fr.example.net",
        probe: PROBE_REPORT,
      },
      session: owner,
      locale: "fr",
    })
    const english = await apiRequest<ErrorBody>("/servers/enroll", {
      body: {
        device_id: deviceId,
        host: "en.example.net",
        probe: PROBE_REPORT,
      },
      session: owner,
      locale: "en",
    })

    expect(french.json.error.message).toContain("gratuit")
    expect(french.json.error.message).toContain("licence")
    expect(english.json.error.message).toContain("free")
    expect(english.json.error.message).toContain("licence")
    expect(english.json.error.fix).toContain(LEGAL_CONTACTS.support)
  })

  it("lève le quota d'une licence accordée par l'équipe", async () => {
    const admin = await platformAdmin()
    const granted = await apiRequest(
      `/admin/organizations/${organizationId}/subscriptions`,
      { body: { seats: 2 }, session: admin }
    )

    expect(granted.status).toBe(201)

    const { responses } = await enrollUpTo(owner, FREE_SERVERS + 3)

    expect(responses.slice(0, -1).every((r) => r.status === 201)).toBe(true)
    expect(responses.at(-1)?.status).toBe(403)
    expect(responses.at(-1)?.json.error.message).toContain(
      String(FREE_SERVERS + 2)
    )
  })

  it("rend /me avec la licence, les serveurs et l'octroi, plus les anciens champs", async () => {
    await createServer({ organizationId })

    const free = await apiRequest<MeBody>("/me", { session: owner })

    expect(free.json).toMatchObject({
      license: "valid",
      servers: { used: 1, limit: FREE_SERVERS },
      license_grant: null,
      entitlement: "valid",
      subscription: null,
    })

    const ends = new Date(Date.now() + 30 * DAY_MS)

    await subscribeOrganization({
      organizationId,
      quantity: 4,
      currentPeriodEnd: ends,
    })

    const licensed = await apiRequest<MeBody>("/me", { session: owner })

    expect(licensed.json).toMatchObject({
      license: "valid",
      servers: { used: 1, limit: FREE_SERVERS + 4 },
      license_grant: {
        status: "active",
        seats: 4,
        current_period_end: ends.toISOString(),
      },
      entitlement: "valid",
      subscription: null,
    })
  })

  it("rend none sans organisation active, et aucun compte de serveurs", async () => {
    const { user } = await createUser({ email: "solo@example.test" })
    const bare = await createSession({
      userId: user.id,
      activeOrganizationId: null,
    })

    const me = await apiRequest<MeBody>("/me", { session: bare })

    expect(me.json).toMatchObject({
      license: "none",
      servers: null,
      license_grant: null,
      entitlement: "none",
      subscription: null,
    })
  })

  it("tient l'organisation Pupitre pour valide, avec ses propres sièges", async () => {
    const { user } = await createUser({
      email: "team@pupitre.studio",
      role: "platform_admin",
    })
    const onPlatform = await createSession({
      userId: user.id,
      activeOrganizationId: PLATFORM_ORGANIZATION_ID,
    })

    for (let index = 0; index < FREE_SERVERS + 1; index += 1) {
      await createServer({ organizationId: PLATFORM_ORGANIZATION_ID })
    }

    const me = await apiRequest<MeBody>("/me", { session: onPlatform })

    expect(me.json).toMatchObject({
      license: "valid",
      servers: { used: FREE_SERVERS + 1, limit: PLATFORM_ORGANIZATION_SEATS },
      license_grant: null,
    })
    expect(
      await harness.prisma.subscription.count({
        where: { organizationId: PLATFORM_ORGANIZATION_ID },
      })
    ).toBe(0)
  })
})

describe("l'état de la licence", () => {
  let harness: ApiTestServer

  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    useBillingOff()
  })

  afterAll(() => {
    useFakeBilling()
  })

  async function organization() {
    const { organization: created } = await createOrganizationWithMembers({
      roles: ["owner"],
    })

    return created.id
  }

  it("est valide sans licence jusqu'aux serveurs gratuits", async () => {
    const id = await organization()

    for (let index = 0; index < FREE_SERVERS; index += 1) {
      await createServer({ organizationId: id })
    }

    expect((await licenseForOrganization(id)).state).toBe("valid")
  })

  it("est valide avec une licence en cours, au-delà des serveurs gratuits", async () => {
    const id = await organization()

    await subscribeOrganization({ organizationId: id, quantity: 2 })

    for (let index = 0; index <= FREE_SERVERS; index += 1) {
      await createServer({ organizationId: id })
    }

    expect((await licenseForOrganization(id)).state).toBe("valid")
  })

  it("passe en tolérance quand la licence est impayée", async () => {
    const id = await organization()

    await subscribeOrganization({ organizationId: id, status: "past_due" })

    expect((await licenseForOrganization(id)).state).toBe("grace")
  })

  it("est suspendue au-delà des serveurs gratuits sans licence ni tolérance ouverte", async () => {
    const id = await organization()

    for (let index = 0; index <= FREE_SERVERS; index += 1) {
      await createServer({ organizationId: id })
    }

    expect((await licenseForOrganization(id)).state).toBe("suspended")
  })

  it("court la tolérance d'une licence échue au-delà des serveurs gratuits, puis suspend", async () => {
    const id = await organization()
    const graceUntil = new Date(Date.now() + DAY_MS)

    for (let index = 0; index <= FREE_SERVERS; index += 1) {
      const { server } = await createServer({ organizationId: id })

      await harness.prisma.server.update({
        where: { id: server.id },
        data: { status: "grace", licenseValidUntil: graceUntil },
      })
    }

    expect(await licenseForOrganization(id)).toEqual({
      state: "grace",
      valid_until: graceUntil,
    })

    const later = new Date(graceUntil.getTime() + GRACE_PERIOD_MS)

    expect(await suspendExpiredGrace(later)).toHaveLength(FREE_SERVERS + 1)
    expect((await licenseForOrganization(id, later)).state).toBe("suspended")
  })

  it("est suspendue quand l'équipe tient l'organisation, quelle que soit sa licence", async () => {
    const id = await organization()

    await subscribeOrganization({ organizationId: id })
    await harness.prisma.organization.update({
      where: { id },
      data: { suspendedAt: new Date() },
    })

    expect((await licenseForOrganization(id)).state).toBe("suspended")
  })

  it("est toujours valide pour l'organisation Pupitre", async () => {
    await createUser({ email: "ops@pupitre.studio", role: "platform_admin" })

    for (let index = 0; index <= FREE_SERVERS; index += 1) {
      await createServer({ organizationId: PLATFORM_ORGANIZATION_ID })
    }

    expect((await licenseForOrganization(PLATFORM_ORGANIZATION_ID)).state).toBe(
      "valid"
    )
  })
})

describe("la facturation coupée", () => {
  let billing: FakeBilling
  let organizationId: string
  let owner: Session

  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    billing = useBillingOff()

    const created = await createOrganizationWithMembers({ roles: ["owner"] })

    organizationId = created.organization.id
    owner = created.members[0].session
  })

  afterAll(() => {
    useFakeBilling()
  })

  it("refuse le checkout, le portail et les sièges sans jamais appeler Stripe", async () => {
    const checkout = await apiRequest<ErrorBody>(
      `/orgs/${organizationId}/checkout`,
      { body: { quantity: 1, interval: "month" }, session: owner }
    )
    const portal = await apiRequest<ErrorBody>(
      `/orgs/${organizationId}/portal`,
      { method: "POST", session: owner }
    )

    await subscribeOrganization({ organizationId, quantity: 1 })

    const seats = await apiRequest<ErrorBody>(`/orgs/${organizationId}/seats`, {
      body: { quantity: 2 },
      session: owner,
    })

    for (const refused of [checkout, portal, seats]) {
      expect(refused.status).toBe(409)
      expect(refused.json.error.code).toBe("conflict")
      expect(refused.json.error.fix).toContain(LEGAL_CONTACTS.support)
    }

    expect(billing.checkouts).toHaveLength(0)
    expect(billing.portals).toHaveLength(0)
    expect(billing.quantities).toHaveLength(0)
  })

  it("refuse un webhook Stripe, même signé", async () => {
    const response = await postStripeWebhook<ErrorBody>(
      stripeEvent(
        "customer.subscription.updated",
        stripeSubscriptionObject({ organizationId })
      )
    )

    expect(response.status).toBe(409)
    expect(response.json.error.code).toBe("conflict")
  })
})
