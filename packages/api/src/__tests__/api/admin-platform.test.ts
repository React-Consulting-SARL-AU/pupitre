import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { LAUNCH_PRODUCT } from "@pupitre/shared/plans"
import { type ApiTestServer, bootApiTestServer, resetDb } from "../../testing"
import {
  createOrganizationWithMembers,
  createServer,
  subscribeOrganization,
} from "../../testing/factories"
import { apiRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

interface ErrorBody {
  error: { code: string }
}

interface Worklist<Item> {
  count: number
  items: Item[]
}

interface OverviewWorklists {
  unread_mail: Worklist<{ id: string; subject: string; address: string }>
  past_due: Worklist<{
    id: string
    organization: { id: string; name: string }
    status: string
  }>
  trials_ending: Worklist<{
    id: string
    organization: { id: string; name: string }
    current_period_end: string | null
  }>
  servers_unreachable: Worklist<{
    id: string
    name: string
    organization: { id: string; name: string }
  }>
  seats_drifted: Worklist<{
    organization: { id: string; name: string }
    paid: number
    used: number
  }>
}

interface OverviewBody {
  data: {
    users: number
    organizations: number
    servers: Record<string, number>
    subscriptions: Record<string, number>
    affiliate_links: number
    referrals: number
    worklists: OverviewWorklists
  }
}

interface AdminUser {
  id: string
  email: string
  name: string
  role: string | null
  banned: boolean
  email_verified: boolean
  created_at: string
  organizations: {
    id: string
    name: string
    slug: string
    role: string
    subscription_status: string | null
    subscription_id: string | null
    servers: number
  }[]
}

interface UsersBody {
  data: AdminUser[]
  total: number
}

let harness: ApiTestServer

async function platformAdmin() {
  const { user } = await createUser({
    email: "support@pupitre.studio",
    role: "platform_admin",
  })

  return await createSession({ userId: user.id })
}

async function populatedPlatform() {
  const atelier = await createOrganizationWithMembers({
    name: "Atelier",
    roles: ["owner", "member"],
  })
  const bureau = await createOrganizationWithMembers({
    name: "Bureau",
    roles: ["owner"],
  })

  await createServer({ organizationId: atelier.organization.id })
  await createServer({
    organizationId: atelier.organization.id,
    status: "grace",
  })
  await createServer({
    organizationId: bureau.organization.id,
    status: "revoked",
  })
  await subscribeOrganization({
    organizationId: atelier.organization.id,
    status: "canceled",
  })
  await subscribeOrganization({
    organizationId: atelier.organization.id,
    status: "active",
  })
  await harness.prisma.subscription.create({
    data: {
      organizationId: bureau.organization.id,
      stripeSubscriptionId: `launch_${bureau.organization.id}`,
      product: LAUNCH_PRODUCT,
      quantity: 1,
      status: "trialing",
    },
  })

  const link = await harness.prisma.affiliateLink.create({
    data: { code: "blog", name: "Blog", freeMonths: 1 },
  })

  await harness.prisma.referral.create({
    data: { organizationId: bureau.organization.id, linkId: link.id },
  })

  return { atelier, bureau }
}

describe("GET /admin/overview", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("refuse un anonyme et un propriétaire", async () => {
    const { atelier } = await populatedPlatform()
    const anonymous = await apiRequest<ErrorBody>("/admin/overview")
    const owner = await apiRequest<ErrorBody>("/admin/overview", {
      session: atelier.members[0],
    })

    expect(anonymous.status).toBe(401)
    expect(owner.status).toBe(403)
    expect(owner.json.error.code).toBe("forbidden")
  })

  it("compte les comptes, les organisations, les serveurs et les abonnements", async () => {
    await populatedPlatform()

    const admin = await platformAdmin()
    const response = await apiRequest<OverviewBody>("/admin/overview", {
      session: admin,
    })

    const { worklists, ...counters } = response.json.data

    expect(response.status).toBe(200)
    expect(worklists.past_due.count).toBe(0)
    expect(counters).toEqual({
      users: 4,
      organizations: 7,
      servers: {
        total: 3,
        enrolling: 0,
        active: 1,
        grace: 1,
        suspended: 0,
        revoked: 1,
      },
      subscriptions: {
        total: 3,
        trialing: 1,
        active: 1,
        past_due: 0,
        canceled: 1,
        other: 0,
        launch: 1,
      },
      affiliate_links: 1,
      referrals: 1,
    })
  })
})

describe("GET /admin/users", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("refuse un anonyme et un propriétaire", async () => {
    const { atelier } = await populatedPlatform()
    const anonymous = await apiRequest<ErrorBody>("/admin/users")
    const owner = await apiRequest<ErrorBody>("/admin/users", {
      session: atelier.members[0],
    })

    expect(anonymous.status).toBe(401)
    expect(owner.status).toBe(403)
  })

  it("liste chaque compte avec ses organisations, leur abonnement qui compte et leurs sièges", async () => {
    const { atelier, bureau } = await populatedPlatform()
    const liveOf = async (organizationId: string, status: string) =>
      (
        await harness.prisma.subscription.findFirstOrThrow({
          where: { organizationId, status },
        })
      ).id
    const admin = await platformAdmin()
    const response = await apiRequest<UsersBody>("/admin/users", {
      session: admin,
    })

    expect(response.status).toBe(200)
    expect(response.json.total).toBe(4)
    expect(response.json.data).toHaveLength(4)

    const atelierOwner = response.json.data.find(
      (user) => user.id === atelier.members[0].user.id
    )
    const bureauOwner = response.json.data.find(
      (user) => user.id === bureau.members[0].user.id
    )
    const support = response.json.data.find(
      (user) => user.id === admin.session.userId
    )

    expect(atelierOwner).toMatchObject({
      email: atelier.members[0].user.email,
      role: "user",
      banned: false,
      email_verified: true,
    })
    expect(atelierOwner?.organizations).toHaveLength(2)
    expect(atelierOwner?.organizations).toContainEqual({
      id: atelier.organization.id,
      name: "Atelier",
      slug: atelier.organization.slug,
      role: "owner",
      subscription_status: "active",
      subscription_id: await liveOf(atelier.organization.id, "active"),
      servers: 2,
    })
    expect(bureauOwner?.organizations).toContainEqual({
      id: bureau.organization.id,
      name: "Bureau",
      slug: bureau.organization.slug,
      role: "owner",
      subscription_status: "trialing",
      subscription_id: await liveOf(bureau.organization.id, "trialing"),
      servers: 0,
    })
    expect(support?.role).toBe("platform_admin")
    expect(support?.organizations).toHaveLength(2)
    expect(support?.organizations.map((one) => one.slug)).toContain("pupitre")
    expect(
      support?.organizations.every((one) => one.subscription_status === null)
    ).toBe(true)
  })

  it("cherche dans l'email et le nom, et pagine", async () => {
    const { atelier } = await populatedPlatform()
    const admin = await platformAdmin()
    const byEmail = await apiRequest<UsersBody>(
      `/admin/users?q=${encodeURIComponent("member-2@")}`,
      { session: admin }
    )
    const byName = await apiRequest<UsersBody>("/admin/users?q=support", {
      session: admin,
    })
    const page = await apiRequest<UsersBody>("/admin/users?limit=1&offset=3", {
      session: admin,
    })
    const tooMany = await apiRequest<ErrorBody>("/admin/users?limit=201", {
      session: admin,
    })

    expect(byEmail.json.total).toBe(1)
    expect(byEmail.json.data[0]?.id).toBe(atelier.members[1].user.id)
    expect(byName.json.total).toBe(1)
    expect(page.json.total).toBe(4)
    expect(page.json.data).toHaveLength(1)
    expect(tooMany.status).toBe(422)
  })

  it("ne garde que les comptes de l'état demandé, un bannissement échu comptant pour actif", async () => {
    const { members } = await createOrganizationWithMembers({
      name: "États",
      roles: ["owner", "admin", "member"],
    })
    const [banni, echu, desactive] = members.map((member) => member.user)
    const { members: autres } = await createOrganizationWithMembers({
      name: "Partants",
      roles: ["owner"],
    })
    const efface = autres[0].user

    await harness.prisma.user.update({
      where: { id: banni.id },
      data: { banned: true, banReason: "abus" },
    })
    await harness.prisma.user.update({
      where: { id: echu.id },
      data: {
        banned: true,
        banReason: "abus",
        banExpires: new Date(Date.now() - 1000),
      },
    })
    await harness.prisma.user.update({
      where: { id: desactive.id },
      data: { deactivatedAt: new Date(), deactivatedReason: "inactif" },
    })
    await harness.prisma.user.update({
      where: { id: efface.id },
      data: { deletionAt: new Date(), deletionReason: "demande" },
    })

    const admin = await platformAdmin()
    const suspended = await apiRequest<UsersBody>(
      "/admin/users?state=suspended",
      { session: admin }
    )
    const deactivated = await apiRequest<UsersBody>(
      "/admin/users?state=deactivated",
      { session: admin }
    )
    const deleting = await apiRequest<UsersBody>(
      "/admin/users?state=deleting",
      {
        session: admin,
      }
    )
    const active = await apiRequest<UsersBody>("/admin/users?state=active", {
      session: admin,
    })
    const searched = await apiRequest<UsersBody>(
      `/admin/users?state=active&q=${encodeURIComponent(echu.email)}`,
      { session: admin }
    )
    const unknown = await apiRequest<ErrorBody>("/admin/users?state=ailleurs", {
      session: admin,
    })
    const ids = active.json.data.map((user) => user.id)

    expect(suspended.json.total).toBe(1)
    expect(suspended.json.data[0]?.id).toBe(banni.id)
    expect(deactivated.json.total).toBe(1)
    expect(deactivated.json.data[0]?.id).toBe(desactive.id)
    expect(deleting.json.total).toBe(1)
    expect(deleting.json.data[0]?.id).toBe(efface.id)
    expect(ids).toContain(echu.id)
    expect(ids).not.toContain(banni.id)
    expect(ids).not.toContain(desactive.id)
    expect(ids).not.toContain(efface.id)
    expect(searched.json.total).toBe(1)
    expect(unknown.status).toBe(422)
  })
})
