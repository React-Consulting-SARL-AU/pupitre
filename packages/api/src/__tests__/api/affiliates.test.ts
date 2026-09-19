import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { CLIENT_IP_HEADER } from "@pupitre/auth/server"
import { PUPITRE_ORIGINS } from "@pupitre/shared/legal"
import {
  AFFILIATE_CODE_LENGTH,
  AFFILIATE_NOTES_MAX_LENGTH,
  DAYS_PER_FREE_MONTH,
  TRIAL_DAYS,
  TRIAL_SEATS,
} from "@pupitre/shared/plans"
import {
  AffiliateCodeTakenError,
  createAffiliateLink,
  recordReferral,
} from "../../lib/affiliates/affiliates"
import { AFFILIATE_HIT_RATE_LIMIT } from "../../lib/api/rate-limit"
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
  partner_name: string | null
  clicks_30_days: number
  url: string
}

interface AffiliateLinkDetail extends AffiliateLink {
  partner: { name: string | null; email: string | null } | null
  notes: string | null
  clicks: { total: number; last_30_days: number }
  conversion: {
    referred: number
    trialing: number
    active: number
    past_due: number
    canceled: number
    seats: number
  }
  organizations: { id: string; subscription_status: string | null }[]
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

function patchLink(
  session: Session,
  id: string,
  body: Record<string, unknown>
) {
  return apiRequest<{ data: AffiliateLink } & ErrorBody>(
    `/admin/affiliate-links/${id}`,
    { method: "PATCH", body, session }
  )
}

function readLink(session: Session, id: string) {
  return apiRequest<{ data: AffiliateLinkDetail } & ErrorBody>(
    `/admin/affiliate-links/${id}`,
    { session }
  )
}

function hit(code: string, headers: Record<string, string> = {}) {
  return apiRequest<ErrorBody>(`/affiliate/${code}/hit`, {
    method: "POST",
    headers,
  })
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
      apiRequest<ErrorBody>("/admin/affiliate-links/nope", {
        method: "DELETE",
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

  it("pose le partenaire et la note dès la création, et refuse un partenaire illisible", async () => {
    const admin = await platformAdmin()
    const created = await createLink(admin, {
      name: "Salon",
      free_months: 1,
      partner_name: "  Ada Lovelace  ",
      partner_email: "ada@partner.test",
      notes: "  Rencontrée au salon  ",
    })
    const blank = await createLink(admin, {
      name: "Sans partenaire",
      free_months: 1,
      partner_name: "   ",
      notes: "",
    })
    const unreadable = await createLink(admin, {
      name: "Illisible",
      free_months: 1,
      partner_email: "ada",
    })

    expect(created.status).toBe(201)
    expect(created.json.data.partner_name).toBe("Ada Lovelace")

    const detail = await readLink(admin, created.json.data.id)

    expect(detail.json.data.partner).toEqual({
      name: "Ada Lovelace",
      email: "ada@partner.test",
    })
    expect(detail.json.data.notes).toBe("Rencontrée au salon")

    const bare = await readLink(admin, blank.json.data.id)

    expect(bare.json.data.partner).toBeNull()
    expect(bare.json.data.notes).toBeNull()
    expect(unreadable.status).toBe(422)
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
    expect(paths).toContain("/api/v1/affiliate/{code}/hit")
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

describe("la fiche d'un lien d'affiliation", () => {
  let harness: ApiTestServer

  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    useFakeBilling()
  })

  it("modifie chaque champ, efface un champ facultatif, et n'écrit que ce qui change", async () => {
    const admin = await platformAdmin()
    const created = await createLink(admin, { name: "Blog", free_months: 1 })
    const { id, code } = created.json.data
    const changed = await patchLink(admin, id, {
      name: "Infolettre",
      free_months: 2,
      seats: 4,
      partner_name: "Camille Roy",
      partner_email: "camille@exemple.fr",
      notes: "Paiement trimestriel.",
    })

    expect(changed.status).toBe(200)
    expect(changed.json.data).toMatchObject({
      name: "Infolettre",
      free_months: 2,
      seats: 4,
      partner_name: "Camille Roy",
    })

    const detail = await readLink(admin, id)

    expect(detail.json.data.partner).toEqual({
      name: "Camille Roy",
      email: "camille@exemple.fr",
    })
    expect(detail.json.data.notes).toBe("Paiement trimestriel.")

    const cleared = await patchLink(admin, id, {
      partner_email: null,
      notes: null,
    })

    expect(cleared.status).toBe(200)

    const after = await readLink(admin, id)

    expect(after.json.data.partner).toEqual({
      name: "Camille Roy",
      email: null,
    })
    expect(after.json.data.notes).toBeNull()

    await patchLink(admin, id, { name: "Infolettre", seats: 4 })

    const payloads = (
      await harness.prisma.event.findMany({
        where: { action: "affiliate_link.updated" },
      })
    ).map((event) => event.payload)

    expect(payloads).toHaveLength(2)
    expect(payloads).toContainEqual({
      code,
      name: "Infolettre",
      free_months: 2,
      seats: 4,
      partner_name: "Camille Roy",
      partner_email: "camille@exemple.fr",
      notes: "Paiement trimestriel.",
    })
    expect(payloads).toContainEqual({ code, partner_email: null, notes: null })
  })

  it("désactive et réactive sans toucher au reste", async () => {
    const admin = await platformAdmin()
    const created = await createLink(admin, {
      name: "Blog",
      free_months: 1,
      seats: 2,
    })
    const disabled = await patchLink(admin, created.json.data.id, {
      disabled: true,
    })

    expect(disabled.json.data).toMatchObject({
      disabled: true,
      name: "Blog",
      seats: 2,
    })

    const enabled = await patchLink(admin, created.json.data.id, {
      disabled: false,
    })

    expect(enabled.json.data.disabled).toBe(false)
  })

  it("refuse un partenaire illisible, une note trop longue et des bornes dépassées", async () => {
    const admin = await platformAdmin()
    const created = await createLink(admin, { name: "Blog", free_months: 1 })
    const { id } = created.json.data
    const refused = await Promise.all([
      patchLink(admin, id, { partner_email: "camille" }),
      patchLink(admin, id, {
        notes: "n".repeat(AFFILIATE_NOTES_MAX_LENGTH + 1),
      }),
      patchLink(admin, id, { free_months: 999 }),
      patchLink(admin, id, { name: "" }),
      patchLink(admin, id, { seats: 0 }),
    ])

    for (const response of refused) {
      expect(response.status).toBe(422)
      expect(response.json.error.code).toBe("validation")
    }

    expect(
      await harness.prisma.event.count({
        where: { action: "affiliate_link.updated" },
      })
    ).toBe(0)
  })

  it("efface un lien que personne n'a suivi, refuse celui qui a amené une organisation", async () => {
    const admin = await platformAdmin()
    const unused = await createLink(admin, { name: "Essai", free_months: 0 })
    const used = await createLink(admin, { name: "Blog", free_months: 1 })
    const { organizationId, owner } = await ownerOfNewOrganization()

    await checkout(organizationId, owner, used.json.data.code)
    await hit(unused.json.data.code)

    const deleted = await apiRequest<ErrorBody>(
      `/admin/affiliate-links/${unused.json.data.id}`,
      { method: "DELETE", session: admin }
    )
    const refused = await apiRequest<ErrorBody>(
      `/admin/affiliate-links/${used.json.data.id}`,
      { method: "DELETE", session: admin }
    )
    const unknown = await apiRequest<ErrorBody>("/admin/affiliate-links/nope", {
      method: "DELETE",
      session: admin,
    })

    expect(deleted.status).toBe(204)
    expect(refused.status).toBe(409)
    expect(refused.json.error.code).toBe("conflict")
    expect(refused.json.error.fix).toBeString()
    expect(unknown.status).toBe(404)
    expect(await harness.prisma.affiliateLink.count()).toBe(1)
    expect(await harness.prisma.affiliateClickDay.count()).toBe(0)

    const event = await harness.prisma.event.findFirstOrThrow({
      where: { action: "affiliate_link.deleted" },
    })

    expect(event.targetType).toBe("affiliate_link")
    expect(event.payload).toEqual({
      code: unused.json.data.code,
      name: "Essai",
    })
  })

  it("compte ce que le lien a rapporté, une organisation à la fois", async () => {
    const admin = await platformAdmin()
    const link = await createLink(admin, { name: "Blog", free_months: 1 })
    const code = link.json.data.code
    const trialing = await ownerOfNewOrganization()
    const active = await ownerOfNewOrganization()
    const gone = await ownerOfNewOrganization()

    for (const arrival of [trialing, active, gone]) {
      await checkout(arrival.organizationId, arrival.owner, code)
    }

    await subscribeOrganization({
      organizationId: trialing.organizationId,
      status: "trialing",
      quantity: 2,
    })
    await subscribeOrganization({
      organizationId: active.organizationId,
      status: "active",
      quantity: 3,
    })
    await subscribeOrganization({
      organizationId: gone.organizationId,
      status: "canceled",
      quantity: 9,
    })

    const detail = await readLink(admin, link.json.data.id)

    expect(detail.json.data.conversion).toEqual({
      referred: 3,
      trialing: 1,
      active: 1,
      past_due: 0,
      canceled: 1,
      seats: 5,
    })
    expect(detail.json.data.referrals).toBe(3)
  })

  it("compte les visites du jour et celles des trente derniers jours", async () => {
    const admin = await platformAdmin()
    const link = await createLink(admin, { name: "Blog", free_months: 1 })
    const other = await createLink(admin, { name: "Forum", free_months: 0 })

    await hit(link.json.data.code)
    await hit(link.json.data.code)

    await harness.prisma.affiliateClickDay.create({
      data: { linkId: link.json.data.id, day: "2020-01-01", count: 7 },
    })

    const rows = await harness.prisma.affiliateClickDay.findMany({
      where: { linkId: link.json.data.id, day: { not: "2020-01-01" } },
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      count: 2,
      day: new Date().toISOString().slice(0, 10),
    })

    const detail = await readLink(admin, link.json.data.id)

    expect(detail.json.data.clicks).toEqual({ total: 9, last_30_days: 2 })
    expect(detail.json.data.clicks_30_days).toBe(2)

    const list = await apiRequest<{ data: AffiliateLink[] }>(
      "/admin/affiliate-links",
      { session: admin }
    )
    const clicks = new Map(
      list.json.data.map((entry) => [entry.name, entry.clicks_30_days])
    )

    expect(clicks.get("Blog")).toBe(2)
    expect(clicks.get("Forum")).toBe(0)
    expect(
      list.json.data.find((entry) => entry.id === other.json.data.id)
        ?.partner_name
    ).toBeNull()
  })
})

describe("le compteur public de visites", () => {
  let harness: ApiTestServer

  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    useFakeBilling()
  })

  it("répond 204 sans session, et ne compte que le lien activé", async () => {
    const admin = await platformAdmin()
    const live = await createLink(admin, { name: "Blog", free_months: 1 })
    const off = await createLink(admin, { name: "Forum", free_months: 0 })

    await patchLink(admin, off.json.data.id, { disabled: true })

    const answers = await Promise.all([
      hit(live.json.data.code),
      hit("inconnu9"),
      hit(off.json.data.code),
      hit("TROP-MAJUSCULE"),
      hit("ab"),
    ])

    for (const answer of answers) {
      expect(answer.status).toBe(204)
    }

    const rows = await harness.prisma.affiliateClickDay.findMany()

    expect(rows).toHaveLength(1)
    expect(rows[0].linkId).toBe(live.json.data.id)
    expect(rows[0].count).toBe(1)
  })

  it("ouvre la route au site et à un poste local, à personne d'autre", async () => {
    const fromSite = await hit("inconnu9", { origin: PUPITRE_ORIGINS.site })
    const fromLocal = await hit("inconnu9", { origin: "http://localhost:4321" })
    const fromElsewhere = await hit("inconnu9", {
      origin: "https://exemple.invalid",
    })
    const health = await apiRequest("/health", {
      headers: { origin: PUPITRE_ORIGINS.site },
    })

    expect(fromSite.raw.headers.get("access-control-allow-origin")).toBe(
      PUPITRE_ORIGINS.site
    )
    expect(fromLocal.raw.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:4321"
    )
    expect(
      fromElsewhere.raw.headers.get("access-control-allow-origin")
    ).toBeNull()
    expect(health.raw.headers.get("access-control-allow-origin")).toBeNull()
  })

  it("coupe une adresse qui martèle le compteur, et laisse les autres passer", async () => {
    const flooding = { [CLIENT_IP_HEADER]: "203.0.113.7" }
    const statuses = new Set<number>()

    for (let attempt = 0; attempt < AFFILIATE_HIT_RATE_LIMIT.limit; attempt++) {
      statuses.add((await hit("inconnu9", flooding)).status)
    }

    expect(statuses).toEqual(new Set([204]))

    const limited = await hit("inconnu9", flooding)

    expect(limited.status).toBe(429)
    expect(limited.json.error.code).toBe("rate_limited")
    expect(Number(limited.raw.headers.get("retry-after"))).toBeGreaterThan(0)

    const neighbour = await hit("inconnu9", {
      [CLIENT_IP_HEADER]: "203.0.113.8",
    })

    expect(neighbour.status).toBe(204)
  })
})
