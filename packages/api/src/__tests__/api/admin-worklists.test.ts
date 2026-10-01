import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { FREE_SERVERS, GRANTED_PRODUCT } from "@pupitre/shared/plans"
import { WORKLIST_ITEMS } from "@pupitre/shared/platform"
import { type ApiTestServer, bootApiTestServer, resetDb } from "../../testing"
import {
  createOrganizationWithMembers,
  createServer,
  subscribeOrganization,
} from "../../testing/factories"
import { apiRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

interface Worklist<Item> {
  count: number
  items: Item[]
}

interface OverviewBody {
  data: {
    worklists: {
      unread_mail: Worklist<{
        id: string
        subject: string
        address: string
        from: { email: string; name: string | null }
      }>
      past_due: Worklist<{
        id: string
        organization: { id: string; name: string; slug: string }
        status: string
      }>
      servers_unreachable: Worklist<{
        id: string
        name: string
        host: string | null
        organization: { id: string; name: string }
      }>
      seats_drifted: Worklist<{
        organization: { id: string; name: string }
        paid: number
        used: number
      }>
      deletions_scheduled: Worklist<{
        kind: "user" | "organization"
        id: string
        label: string
        deletion_at: string
      }>
    }
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

let harness: ApiTestServer

async function platformAdmin() {
  const { user } = await createUser({
    email: "support@pupitre.studio",
    role: "platform_admin",
  })

  return await createSession({ userId: user.id })
}

function inDays(days: number): Date {
  return new Date(Date.now() + days * DAY_MS)
}

async function readWorklists() {
  const admin = await platformAdmin()
  const response = await apiRequest<OverviewBody>("/admin/overview", {
    session: admin,
  })

  expect(response.status).toBe(200)

  return response.json.data.worklists
}

async function unreadThread(subject: string, from: string) {
  const thread = await harness.prisma.mailThread.create({
    data: {
      address: "support@pupitre.studio",
      subject,
      normalizedSubject: subject.toLowerCase(),
      unread: true,
      lastInboundAt: new Date(),
    },
  })

  await harness.prisma.mailMessage.create({
    data: {
      threadId: thread.id,
      direction: "inbound",
      fromEmail: from,
      fromName: "Ada",
      toEmails: ["support@pupitre.studio"],
      ccEmails: [],
      subject,
      text: "Bonjour",
    },
  })

  return thread
}

describe("the worklists of GET /admin/overview", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("returns at most five unread conversations and counts all the others", async () => {
    for (let index = 0; index < WORKLIST_ITEMS + 2; index += 1) {
      await unreadThread(`Sujet ${index}`, `ada${index}@test.local`)
    }

    const worklists = await readWorklists()

    expect(worklists.unread_mail.count).toBe(WORKLIST_ITEMS + 2)
    expect(worklists.unread_mail.items).toHaveLength(WORKLIST_ITEMS)
    expect(worklists.unread_mail.items[0].from.email).toContain("@test.local")
    expect(worklists.unread_mail.items[0].address).toBe(
      "support@pupitre.studio"
    )
  })

  it("raises unpaid subscriptions with their organization", async () => {
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })

    await subscribeOrganization({
      organizationId: organization.id,
      status: "past_due",
      currentPeriodEnd: inDays(-2),
    })

    const worklists = await readWorklists()

    expect(worklists.past_due.count).toBe(1)
    expect(worklists.past_due.items[0].organization.name).toBe("Atelier")
    expect(worklists.past_due.items[0].status).toBe("past_due")
  })

  it("raises unreachable servers from open alerts, never from closed ones", async () => {
    const { organization } = await createOrganizationWithMembers({
      name: "Atelier",
      roles: ["owner"],
    })
    const { server } = await createServer({
      organizationId: organization.id,
      name: "vps-muet",
    })
    const { server: revenu } = await createServer({
      organizationId: organization.id,
      name: "vps-revenu",
    })

    await harness.prisma.alert.create({
      data: { serverId: server.id, kind: "server_unreachable" },
    })
    await harness.prisma.alert.create({
      data: {
        serverId: revenu.id,
        kind: "server_unreachable",
        resolvedAt: new Date(),
      },
    })
    await harness.prisma.alert.create({
      data: { serverId: revenu.id, kind: "disk_high" },
    })

    const worklists = await readWorklists()

    expect(worklists.servers_unreachable.count).toBe(1)
    expect(worklists.servers_unreachable.items[0].name).toBe("vps-muet")
    expect(worklists.servers_unreachable.items[0].organization.name).toBe(
      "Atelier"
    )
  })

  it("raises organizations that occupy more seats than they pay for", async () => {
    const drifted = await createOrganizationWithMembers({
      name: "Débordée",
      roles: ["owner"],
    })
    const fitting = await createOrganizationWithMembers({
      name: "En règle",
      roles: ["owner"],
    })

    await subscribeOrganization({
      organizationId: drifted.organization.id,
      status: "active",
      quantity: 1,
    })
    await subscribeOrganization({
      organizationId: fitting.organization.id,
      status: "active",
      quantity: 5,
    })
    for (let index = 0; index < FREE_SERVERS + 2; index += 1) {
      await createServer({ organizationId: drifted.organization.id })
    }

    await createServer({ organizationId: fitting.organization.id })

    const worklists = await readWorklists()

    expect(worklists.seats_drifted.count).toBe(1)
    expect(worklists.seats_drifted.items[0]).toMatchObject({
      paid: 1,
      used: 2,
    })
    expect(worklists.seats_drifted.items[0].organization.name).toBe("Débordée")
  })

  it("also raises an exceeded granted licence, like the filtered list it opens", async () => {
    const { organization } = await createOrganizationWithMembers({
      name: "Accordée",
      roles: ["owner"],
    })

    await harness.prisma.subscription.create({
      data: {
        organizationId: organization.id,
        stripeSubscriptionId: `granted_${organization.id}`,
        product: GRANTED_PRODUCT,
        quantity: 1,
        status: "active",
      },
    })
    for (let index = 0; index < FREE_SERVERS + 2; index += 1) {
      await createServer({ organizationId: organization.id })
    }

    const admin = await platformAdmin()
    const overview = await apiRequest<OverviewBody>("/admin/overview", {
      session: admin,
    })
    const listed = await apiRequest<{ data: unknown[] }>(
      "/admin/subscriptions?drifted=true",
      { session: admin }
    )
    const drifted = overview.json.data.worklists.seats_drifted

    expect(drifted.count).toBe(1)
    expect(drifted.items[0]).toMatchObject({
      organization: { name: "Accordée" },
      paid: 1,
      used: 2,
    })
    expect(listed.json.data).toHaveLength(1)
  })

  it("raises the accounts and organizations whose purge is scheduled, the nearest first", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      name: "Partie",
      roles: ["owner"],
    })
    const { organization: gardee } = await createOrganizationWithMembers({
      name: "Gardée",
      roles: ["owner"],
    })

    await harness.prisma.organization.update({
      where: { id: organization.id },
      data: { deletionAt: inDays(6), deletionReason: "Demande du client" },
    })
    await harness.prisma.user.update({
      where: { id: members[0].user.id },
      data: { deletionAt: inDays(2), deletionReason: "Demande du client" },
    })

    const worklists = await readWorklists()

    expect(worklists.deletions_scheduled.count).toBe(2)
    expect(worklists.deletions_scheduled.items[0]).toMatchObject({
      kind: "user",
      id: members[0].user.id,
      label: members[0].user.email,
    })
    expect(worklists.deletions_scheduled.items[1]).toMatchObject({
      kind: "organization",
      id: organization.id,
      label: "Partie",
    })
    expect(
      worklists.deletions_scheduled.items.some((item) => item.id === gardee.id)
    ).toBe(false)
  })

  it("keeps only five scheduled deletions and counts all the others", async () => {
    for (let index = 0; index < WORKLIST_ITEMS + 2; index += 1) {
      const { organization } = await createOrganizationWithMembers({
        name: `Organisation ${index}`,
        roles: ["owner"],
      })

      await harness.prisma.organization.update({
        where: { id: organization.id },
        data: { deletionAt: inDays(index + 1) },
      })
    }

    const worklists = await readWorklists()

    expect(worklists.deletions_scheduled.count).toBe(WORKLIST_ITEMS + 2)
    expect(worklists.deletions_scheduled.items).toHaveLength(WORKLIST_ITEMS)
  })

  it("refuses an anonymous user", async () => {
    const response = await apiRequest("/admin/overview")

    expect(response.status).toBe(401)
  })
})
