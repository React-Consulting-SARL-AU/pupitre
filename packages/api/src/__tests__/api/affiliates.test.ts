import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { CLIENT_IP_HEADER } from "@pupitre/auth/server"
import { PUPITRE_ORIGINS } from "@pupitre/shared/legal"
import {
  AFFILIATE_CODE_LENGTH,
  AFFILIATE_COOKIE,
  AFFILIATE_NOTES_MAX_LENGTH,
} from "@pupitre/shared/plans"
import {
  AffiliateCodeTakenError,
  affiliateCodeFromCookie,
  createAffiliateLink,
  recordReferral,
  recordSignUpReferral,
} from "../../lib/affiliates/affiliates"
import { AFFILIATE_HIT_RATE_LIMIT } from "../../lib/api/rate-limit"
import type { FakeBilling } from "../../lib/billing/fake"
import {
  type ApiTestServer,
  bootApiTestServer,
  resetDb,
  TEST_BASE_URL,
} from "../../testing"
import { useFakeBilling } from "../../testing/billing"
import {
  createOrganizationWithMembers,
  createServer,
} from "../../testing/factories"
import { apiRequest, authRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

interface Session {
  token: string
}

interface AffiliateLink {
  id: string
  code: string
  name: string
  disabled: boolean
  created_at: string
  referrals: number
  servers: number
  partner_name: string | null
  clicks_30_days: number
  url: string
}

interface AffiliateLinkDetail extends AffiliateLink {
  partner: { name: string | null; email: string | null } | null
  notes: string | null
  clicks: { total: number; last_30_days: number }
  conversion: { referred: number; servers: number }
  organizations: { id: string; servers: number }[]
}

interface ErrorBody {
  error: { code: string; message: string; fix?: string }
}

const URL_RE = /https?:\/\/\S+/

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

function signUp(
  organizationId: string,
  userId: string,
  code: string | null
): Promise<void> {
  return recordSignUpReferral({
    organizationId,
    userId,
    cookie: code ? `theme=dark; ${AFFILIATE_COOKIE}=${code}` : "theme=dark",
  })
}

describe("affiliate links", () => {
  let harness: ApiTestServer

  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    useFakeBilling()
  })

  it("refuses an anonymous user and an owner on every route", async () => {
    const { owner } = await ownerOfNewOrganization()
    const calls = [
      apiRequest<ErrorBody>("/admin/affiliate-links"),
      apiRequest<ErrorBody>("/admin/affiliate-links", { session: owner }),
      createLink(owner, { name: "Newsletter" }),
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

  it("creates a link with a generated code, without an offer, and lists it with its address", async () => {
    const admin = await platformAdmin()
    const created = await createLink(admin, { name: "Newsletter" })

    expect(created.status).toBe(201)
    expect(created.json.data).toMatchObject({
      name: "Newsletter",
      disabled: false,
      referrals: 0,
      servers: 0,
    })
    expect(created.json.data).not.toHaveProperty("free_months")
    expect(created.json.data).not.toHaveProperty("seats")
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
    expect(event.payload).toEqual({
      code: created.json.data.code,
      name: "Newsletter",
    })
  })

  it("accepts a chosen code, refuses a code that is taken or malformed", async () => {
    const admin = await platformAdmin()
    const chosen = await createLink(admin, {
      name: "Podcast",
      code: "podcast-42",
    })
    const taken = await createLink(admin, {
      name: "Encore",
      code: "podcast-42",
    })
    const malformed = await createLink(admin, {
      name: "Majuscules",
      code: "PODCAST",
    })

    expect(chosen.status).toBe(201)
    expect(chosen.json.data).toMatchObject({ code: "podcast-42" })
    expect(taken.status).toBe(409)
    expect(taken.json.error.code).toBe("conflict")
    expect(taken.json.error.message).toContain("podcast-42")
    expect(taken.json.error.fix).toBeString()
    expect(malformed.status).toBe(422)
  })

  it("sets the partner and the note at creation, and refuses an unreadable partner", async () => {
    const admin = await platformAdmin()
    const created = await createLink(admin, {
      name: "Salon",
      partner_name: "  Ada Lovelace  ",
      partner_email: "ada@partner.test",
      notes: "  Rencontrée au salon  ",
    })
    const blank = await createLink(admin, {
      name: "Sans partenaire",
      partner_name: "   ",
      notes: "",
    })
    const unreadable = await createLink(admin, {
      name: "Illisible",
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

  it("deactivates then reactivates a link, and does not know the others", async () => {
    const admin = await platformAdmin()
    const created = await createLink(admin, { name: "Blog" })
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

  it("stays out of the OpenAPI document", async () => {
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

describe("an organization's origin", () => {
  let harness: ApiTestServer
  let billing: FakeBilling

  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    billing = useFakeBilling()
  })

  it("reads the code from the site cookie, and nothing else", () => {
    expect(affiliateCodeFromCookie(`a=b; ${AFFILIATE_COOKIE}=blog-1`)).toBe(
      "blog-1"
    )
    expect(affiliateCodeFromCookie(`${AFFILIATE_COOKIE}=PAS VALIDE`)).toBeNull()
    expect(affiliateCodeFromCookie("theme=dark")).toBeNull()
    expect(affiliateCodeFromCookie(null)).toBeNull()
  })

  it("is recorded once at sign-up, and never twice", async () => {
    const admin = await platformAdmin()
    const first = await createLink(admin, { name: "Blog" })
    const second = await createLink(admin, { name: "Forum" })
    const { organizationId, owner } = await ownerOfNewOrganization()

    await signUp(organizationId, owner.user.id, first.json.data.code)
    await signUp(organizationId, owner.user.id, second.json.data.code)

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

  it("is recorded when an account signs up by magic link with the site cookie", async () => {
    const admin = await platformAdmin()
    const link = await createLink(admin, { name: "Blog" })
    const email = "arrivee@test.local"
    const requested = await authRequest("POST", "/sign-in/magic-link", {
      email,
      callbackURL: "/dashboard",
    })

    expect(requested.status).toBe(200)

    const token = new URL(
      harness.sentEmails.at(-1)?.text.match(URL_RE)?.[0] ?? TEST_BASE_URL
    ).searchParams.get("token")

    await authRequest(
      "GET",
      `/magic-link/verify?token=${token}&callbackURL=/dashboard`,
      undefined,
      { cookie: `${AFFILIATE_COOKIE}=${link.json.data.code}` }
    )

    const user = await harness.prisma.user.findFirstOrThrow({
      where: { email },
      include: { members: true },
    })
    const referral = await harness.prisma.referral.findUniqueOrThrow({
      where: { organizationId: user.members[0]?.organizationId ?? "" },
    })

    expect(referral.linkId).toBe(link.json.data.id)
  })

  it("writes nothing at sign-up without an origin cookie", async () => {
    const { organizationId, owner } = await ownerOfNewOrganization()

    await signUp(organizationId, owner.user.id, null)

    expect(await harness.prisma.referral.count()).toBe(0)
  })

  it("is also recorded at checkout when Stripe sells", async () => {
    const admin = await platformAdmin()
    const link = await createLink(admin, { name: "Blog" })
    const { organizationId, owner } = await ownerOfNewOrganization()

    const response = await checkout(organizationId, owner, link.json.data.code)

    expect(response.status).toBe(200)
    expect(
      (
        await harness.prisma.referral.findUniqueOrThrow({
          where: { organizationId },
        })
      ).linkId
    ).toBe(link.json.data.id)
    expect(billing.checkouts[0]).toMatchObject({ organizationId, quantity: 5 })
  })

  it("writes only one origin when two sign-ups start together", async () => {
    const admin = await platformAdmin()
    const link = await createLink(admin, { name: "Blog" })
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

  it("refuses the second of two links created together on the same code", async () => {
    const { user } = await createUser({ email: "equipe@pupitre.studio" })
    const input = { name: "Blog", code: "atelier" }
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

  it("silently ignores an unknown, deactivated or malformed code", async () => {
    const admin = await platformAdmin()
    const link = await createLink(admin, { name: "Blog" })

    await apiRequest(`/admin/affiliate-links/${link.json.data.id}`, {
      method: "PATCH",
      body: { disabled: true },
      session: admin,
    })

    const { organizationId, owner } = await ownerOfNewOrganization()

    for (const code of ["unknown1", link.json.data.code, "NOT VALID"]) {
      await signUp(organizationId, owner.user.id, code)
    }

    expect(await harness.prisma.referral.count()).toBe(0)
  })
})

describe("an affiliate link's detail", () => {
  let harness: ApiTestServer

  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    useFakeBilling()
  })

  it("edits each field, clears an optional field, and writes only what changes", async () => {
    const admin = await platformAdmin()
    const created = await createLink(admin, { name: "Blog" })
    const { id, code } = created.json.data
    const changed = await patchLink(admin, id, {
      name: "Infolettre",
      partner_name: "Camille Roy",
      partner_email: "camille@exemple.fr",
      notes: "Paiement trimestriel.",
    })

    expect(changed.status).toBe(200)
    expect(changed.json.data).toMatchObject({
      name: "Infolettre",
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

    await patchLink(admin, id, { name: "Infolettre" })

    const payloads = (
      await harness.prisma.event.findMany({
        where: { action: "affiliate_link.updated" },
      })
    ).map((event) => event.payload)

    expect(payloads).toHaveLength(2)
    expect(payloads).toContainEqual({
      code,
      name: "Infolettre",
      partner_name: "Camille Roy",
      partner_email: "camille@exemple.fr",
      notes: "Paiement trimestriel.",
    })
    expect(payloads).toContainEqual({ code, partner_email: null, notes: null })
  })

  it("deactivates and reactivates without touching the rest", async () => {
    const admin = await platformAdmin()
    const created = await createLink(admin, {
      name: "Blog",
      partner_name: "Camille Roy",
    })
    const disabled = await patchLink(admin, created.json.data.id, {
      disabled: true,
    })

    expect(disabled.json.data).toMatchObject({
      disabled: true,
      name: "Blog",
      partner_name: "Camille Roy",
    })

    const enabled = await patchLink(admin, created.json.data.id, {
      disabled: false,
    })

    expect(enabled.json.data.disabled).toBe(false)
  })

  it("leaves the modification date where it is when nothing changes", async () => {
    const admin = await platformAdmin()
    const created = await createLink(admin, { name: "Blog" })
    const { id } = created.json.data
    const before = await harness.prisma.affiliateLink.findUniqueOrThrow({
      where: { id },
    })
    const same = await patchLink(admin, id, {
      name: "Blog",
      disabled: false,
    })
    const after = await harness.prisma.affiliateLink.findUniqueOrThrow({
      where: { id },
    })

    expect(same.status).toBe(200)
    expect(same.json.data).toMatchObject({ name: "Blog" })
    expect(after.updatedAt).toEqual(before.updatedAt)
    expect(
      await harness.prisma.event.count({
        where: { action: "affiliate_link.updated" },
      })
    ).toBe(0)
  })

  it("refuses an unreadable partner, a note that is too long and an empty name", async () => {
    const admin = await platformAdmin()
    const created = await createLink(admin, { name: "Blog" })
    const { id } = created.json.data
    const refused = await Promise.all([
      patchLink(admin, id, { partner_email: "camille" }),
      patchLink(admin, id, {
        notes: "n".repeat(AFFILIATE_NOTES_MAX_LENGTH + 1),
      }),
      patchLink(admin, id, { name: "" }),
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

  it("erases a link nobody followed, refuses the one that brought an organization", async () => {
    const admin = await platformAdmin()
    const unused = await createLink(admin, { name: "Essai" })
    const used = await createLink(admin, { name: "Blog" })
    const { organizationId, owner } = await ownerOfNewOrganization()

    await signUp(organizationId, owner.user.id, used.json.data.code)
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
    expect(
      await harness.prisma.referral.count({
        where: { linkId: used.json.data.id },
      })
    ).toBe(1)
    expect(
      await harness.prisma.event.count({
        where: { action: "affiliate_link.deleted" },
      })
    ).toBe(1)

    const event = await harness.prisma.event.findFirstOrThrow({
      where: { action: "affiliate_link.deleted" },
    })

    expect(event.targetType).toBe("affiliate_link")
    expect(event.payload).toEqual({
      code: unused.json.data.code,
      name: "Essai",
    })
  })

  it("counts the servers enrolled by the organizations that came through the link", async () => {
    const admin = await platformAdmin()
    const link = await createLink(admin, { name: "Blog" })
    const other = await createLink(admin, { name: "Forum" })
    const code = link.json.data.code
    const busy = await ownerOfNewOrganization()
    const quiet = await ownerOfNewOrganization()
    const elsewhere = await ownerOfNewOrganization()

    await signUp(busy.organizationId, busy.owner.user.id, code)
    await signUp(quiet.organizationId, quiet.owner.user.id, code)
    await signUp(
      elsewhere.organizationId,
      elsewhere.owner.user.id,
      other.json.data.code
    )

    await createServer({ organizationId: busy.organizationId })
    await createServer({ organizationId: busy.organizationId, status: "grace" })
    await createServer({
      organizationId: busy.organizationId,
      status: "enrolling",
    })
    await createServer({
      organizationId: busy.organizationId,
      status: "revoked",
    })
    await createServer({ organizationId: elsewhere.organizationId })

    const detail = await readLink(admin, link.json.data.id)

    expect(detail.json.data.referrals).toBe(2)
    expect(detail.json.data.servers).toBe(2)
    expect(detail.json.data.conversion).toEqual({ referred: 2, servers: 2 })
    expect(
      new Map(
        detail.json.data.organizations.map((organization) => [
          organization.id,
          organization.servers,
        ])
      )
    ).toEqual(
      new Map([
        [busy.organizationId, 2],
        [quiet.organizationId, 0],
      ])
    )

    const list = await apiRequest<{ data: AffiliateLink[] }>(
      "/admin/affiliate-links",
      { session: admin }
    )
    const servers = new Map(
      list.json.data.map((entry) => [entry.name, entry.servers])
    )

    expect(servers.get("Blog")).toBe(2)
    expect(servers.get("Forum")).toBe(1)
  })

  it("counts today's visits and those of the last thirty days", async () => {
    const admin = await platformAdmin()
    const link = await createLink(admin, { name: "Blog" })
    const other = await createLink(admin, { name: "Forum" })

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

describe("the public visit counter", () => {
  let harness: ApiTestServer

  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    useFakeBilling()
  })

  it("answers 204 without a session, and counts only the active link", async () => {
    const admin = await platformAdmin()
    const live = await createLink(admin, { name: "Blog" })
    const off = await createLink(admin, { name: "Forum" })

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

  it("opens the route to the site and a local machine, to nobody else", async () => {
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

  it("cuts off an address hammering the counter, and lets the others through", async () => {
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
