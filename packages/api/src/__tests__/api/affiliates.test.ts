import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import {
  AFFILIATE_CODE_LENGTH,
  DAYS_PER_FREE_MONTH,
  TRIAL_DAYS,
  TRIAL_SEATS,
} from "@pupitre/shared/plans"
import {
  AffiliateCodeTakenError,
  createAffiliateLink,
  recordReferral,
} from "../../lib/affiliates/affiliates"
import type { FakeBilling } from "../../lib/billing/fake"
import { type ApiTestServer, bootApiTestServer, resetDb } from "../../testing"
import { useFakeBilling } from "../../testing/billing"
import {
  createOrganizationWithMembers,
  subscribeOrganization,
} from "../../testing/factories"
import { apiRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

interface Session {
  token: string
}

interface AffiliateLink {
  id: string
  code: string
  name: string
  free_months: number
  seats: number
  disabled: boolean
  created_at: string
  referrals: number
  url: string
}

interface ErrorBody {
  error: { code: string; message: string; fix?: string }
}

async function platformAdmin() {
  const { user } = await createUser({
    email: "support@pupitre.studio",
    role: "platform_admin",
  })

  return await createSession({ userId: user.id })
}

async function ownerOfNewOrganization() {
  const { organization, members } = await createOrganizationWithMembers({
    roles: ["owner"],
  })

  return { organizationId: organization.id, owner: members[0] }
}

function createLink(session: Session, body: Record<string, unknown>) {
  return apiRequest<{ data: AffiliateLink } & ErrorBody>(
    "/admin/affiliate-links",
    { body, session }
  )
}

function checkout(
  organizationId: string,
  session: Session,
  affiliateCode?: string
) {
  return apiRequest<{ url: string }>(`/orgs/${organizationId}/checkout`, {
    body: { quantity: 5, interval: "month", affiliate_code: affiliateCode },
    session,
  })
}

describe("les liens d'affiliation", () => {
  let harness: ApiTestServer

  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    useFakeBilling()
  })

  it("refuse un anonyme et un propriétaire sur chaque route", async () => {
    const { owner } = await ownerOfNewOrganization()
    const calls = [
      apiRequest<ErrorBody>("/admin/affiliate-links"),
      apiRequest<ErrorBody>("/admin/affiliate-links", { session: owner }),
      createLink(owner, { name: "Newsletter", free_months: 1 }),
      apiRequest<ErrorBody>("/admin/affiliate-links/nope", {
        method: "PATCH",
        body: { disabled: true },
        session: owner,
      }),
    ]
    const [anonymous, ...asOwner] = await Promise.all(calls)

    expect(anonymous.status).toBe(401)

    for (const response of asOwner) {
      expect(response.status).toBe(403)
      expect(response.json.error.code).toBe("forbidden")
    }
  })

  it("crée un lien avec un code tiré, et le liste avec son adresse", async () => {
    const admin = await platformAdmin()
    const created = await createLink(admin, {
      name: "Newsletter",
      free_months: 3,
    })

    expect(created.status).toBe(201)
    expect(created.json.data).toMatchObject({
      name: "Newsletter",
      free_months: 3,
      seats: 1,
      disabled: false,
      referrals: 0,
    })
    expect(created.json.data.code).toMatch(
      new RegExp(`^[a-z0-9]{${AFFILIATE_CODE_LENGTH}}$`)
    )
    expect(created.json.data.url).toBe(
      `https://pupitre.studio/?ref=${created.json.data.code}`
    )

    const list = await apiRequest<{ data: AffiliateLink[] }>(
      "/admin/affiliate-links",
      { session: admin }
    )

    expect(list.status).toBe(200)
    expect(list.json.data.map((link) => link.id)).toEqual([
      created.json.data.id,
    ])

    const event = await harness.prisma.event.findFirstOrThrow({
      where: { action: "affiliate_link.created" },
    })

    expect(event.actorUserId).toBe(admin.session.userId)
    expect(event.targetType).toBe("affiliate_link")
    expect(event.targetId).toBe(created.json.data.id)
  })

  it("accepte un code choisi, refuse un code pris ou mal formé", async () => {
    const admin = await platformAdmin()
    const chosen = await createLink(admin, {
      name: "Podcast",
      code: "podcast-42",
      free_months: 2,
      seats: 3,
    })
    const taken = await createLink(admin, {
      name: "Encore",
      code: "podcast-42",
      free_months: 0,
    })
    const malformed = await createLink(admin, {
      name: "Majuscules",
      code: "PODCAST",
      free_months: 0,
    })
    const tooLong = await createLink(admin, {
      name: "Trop",
      free_months: 25,
    })

    expect(chosen.status).toBe(201)
    expect(chosen.json.data).toMatchObject({ code: "podcast-42", seats: 3 })
    expect(taken.status).toBe(409)
    expect(taken.json.error.code).toBe("conflict")
    expect(taken.json.error.message).toContain("podcast-42")
    expect(taken.json.error.fix).toBeString()
    expect(malformed.status).toBe(422)
    expect(tooLong.status).toBe(422)
  })

  it("désactive puis réactive un lien, et ne connaît pas les autres", async () => {
    const admin = await platformAdmin()
    const created = await createLink(admin, { name: "Blog", free_months: 1 })
    const disabled = await apiRequest<{ data: AffiliateLink }>(
      `/admin/affiliate-links/${created.json.data.id}`,
      { method: "PATCH", body: { disabled: true }, session: admin }
    )
    const enabled = await apiRequest<{ data: AffiliateLink }>(
      `/admin/affiliate-links/${created.json.data.id}`,
      { method: "PATCH", body: { disabled: false }, session: admin }
    )
    const unknown = await apiRequest<ErrorBody>("/admin/affiliate-links/nope", {
      method: "PATCH",
      body: { disabled: true },
      session: admin,
    })

    expect(disabled.status).toBe(200)
    expect(disabled.json.data.disabled).toBe(true)
    expect(enabled.json.data.disabled).toBe(false)
    expect(unknown.status).toBe(404)
    expect(unknown.json.error.code).toBe("not_found")
    expect(
      await harness.prisma.event.count({
        where: { action: "affiliate_link.updated" },
      })
    ).toBe(2)
  })

  it("reste hors du document OpenAPI", async () => {
    const document = await apiRequest<{ paths: Record<string, unknown> }>(
      "/openapi/json"
    )
    const paths = Object.keys(document.json.paths)

    expect(paths).not.toContain("/api/v1/admin/affiliate-links")
    expect(paths).not.toContain("/api/v1/admin/overview")
    expect(paths).not.toContain("/api/v1/admin/users")
  })
})

describe("la provenance d'une organisation", () => {
  let harness: ApiTestServer
  let billing: FakeBilling

  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    billing = useFakeBilling()
  })

  it("se note une fois au checkout, et jamais deux", async () => {
    const admin = await platformAdmin()
    const first = await createLink(admin, { name: "Blog", free_months: 1 })
    const second = await createLink(admin, { name: "Forum", free_months: 1 })
    const { organizationId, owner } = await ownerOfNewOrganization()

    const response = await checkout(organizationId, owner, first.json.data.code)

    expect(response.status).toBe(200)

    await checkout(organizationId, owner, second.json.data.code)

    const referral = await harness.prisma.referral.findUniqueOrThrow({
      where: { organizationId },
    })

    expect(referral.linkId).toBe(first.json.data.id)

    const events = await harness.prisma.event.findMany({
      where: { action: "referral.recorded", organizationId },
    })

    expect(events).toHaveLength(1)
    expect(events[0].targetId).toBe(first.json.data.id)
    expect(events[0].payload).toEqual({ code: first.json.data.code })

    const list = await apiRequest<{ data: AffiliateLink[] }>(
      "/admin/affiliate-links",
      { session: admin }
    )

    expect(
      list.json.data.map((link) => [link.name, link.referrals]).sort()
    ).toEqual([
      ["Blog", 1],
      ["Forum", 0],
    ])
  })

  it("n'écrit qu'une provenance quand deux checkouts partent ensemble", async () => {
    const admin = await platformAdmin()
    const link = await createLink(admin, { name: "Blog", free_months: 1 })
    const { organizationId, owner } = await ownerOfNewOrganization()
    const code = link.json.data.code
    const written = await Promise.all([
      recordReferral({ organizationId, userId: owner.user.id }, code),
      recordReferral({ organizationId, userId: owner.user.id }, code),
    ])

    expect(written.filter(Boolean)).toHaveLength(1)
    expect(
      await harness.prisma.referral.count({ where: { organizationId } })
    ).toBe(1)
    expect(
      await harness.prisma.event.count({
        where: { action: "referral.recorded", organizationId },
      })
    ).toBe(1)
  })

  it("refuse le second de deux liens créés ensemble sur le même code", async () => {
    const { user } = await createUser({ email: "equipe@pupitre.studio" })
    const input = { name: "Blog", code: "atelier", free_months: 1 }
    const outcomes = await Promise.allSettled([
      createAffiliateLink({ userId: user.id }, input),
      createAffiliateLink({ userId: user.id }, { ...input, name: "Forum" }),
    ])
    const refused = outcomes.filter((outcome) => outcome.status === "rejected")

    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled")
    ).toHaveLength(1)
    expect(refused).toHaveLength(1)
    expect((refused[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      AffiliateCodeTakenError
    )
    expect(await harness.prisma.affiliateLink.count()).toBe(1)
    expect(
      await harness.prisma.event.count({
        where: { action: "affiliate_link.created" },
      })
    ).toBe(1)
  })

  it("ignore en silence un code inconnu, désactivé ou mal formé", async () => {
    const admin = await platformAdmin()
    const link = await createLink(admin, { name: "Blog", free_months: 1 })

    await apiRequest(`/admin/affiliate-links/${link.json.data.id}`, {
      method: "PATCH",
      body: { disabled: true },
      session: admin,
    })

    const { organizationId, owner } = await ownerOfNewOrganization()

    for (const code of ["unknown1", link.json.data.code, "NOT VALID"]) {
      const response = await checkout(organizationId, owner, code)

      expect(response.status).toBe(200)
    }

    expect(await harness.prisma.referral.count()).toBe(0)
    expect(billing.checkouts).toHaveLength(3)
  })

  it("ouvre le premier checkout aux conditions du lien", async () => {
    const admin = await platformAdmin()
    const link = await createLink(admin, {
      name: "Partenaire",
      free_months: 3,
      seats: 2,
    })
    const { organizationId, owner } = await ownerOfNewOrganization()

    await checkout(organizationId, owner, link.json.data.code)

    expect(billing.checkouts[0]).toMatchObject({
      organizationId,
      trialDays: 3 * DAYS_PER_FREE_MONTH,
      quantity: 2,
    })
  })

  it("garde l'essai par défaut sur un lien qui ne fait que tracer", async () => {
    const admin = await platformAdmin()
    const link = await createLink(admin, {
      name: "Trace",
      free_months: 0,
      seats: 3,
    })
    const { organizationId, owner } = await ownerOfNewOrganization()

    await checkout(organizationId, owner, link.json.data.code)

    expect(billing.checkouts[0]).toMatchObject({
      trialDays: TRIAL_DAYS,
      quantity: 3,
    })
  })

  it("ouvre un seul essai par organisation, d'un siège sans lien", async () => {
    const { organizationId, owner } = await ownerOfNewOrganization()

    await checkout(organizationId, owner)

    expect(billing.checkouts[0]).toMatchObject({
      trialDays: TRIAL_DAYS,
      quantity: TRIAL_SEATS,
    })

    await subscribeOrganization({ organizationId, status: "canceled" })
    await checkout(organizationId, owner)

    expect(billing.checkouts[1]).toMatchObject({
      trialDays: null,
      quantity: 5,
    })
  })
})
