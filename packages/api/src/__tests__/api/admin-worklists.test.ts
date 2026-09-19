import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { TRIAL_WARN_DAYS, WORKLIST_ITEMS } from "@pupitre/shared/platform"
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
      trials_ending: Worklist<{
        id: string
        organization: { id: string; name: string }
        current_period_end: string | null
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

describe("les listes de travail de GET /admin/overview", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("rend cinq conversations non lues au plus et compte toutes les autres", async () => {
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

  it("lève les abonnements impayés avec leur organisation", async () => {
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

  it("ne lève que les essais qui finissent dans la fenêtre", async () => {
    const soon = await createOrganizationWithMembers({
      name: "Bientôt",
      roles: ["owner"],
    })
    const later = await createOrganizationWithMembers({
      name: "Plus tard",
      roles: ["owner"],
    })

    await subscribeOrganization({
      organizationId: soon.organization.id,
      status: "trialing",
      currentPeriodEnd: inDays(TRIAL_WARN_DAYS - 1),
    })
    await subscribeOrganization({
      organizationId: later.organization.id,
      status: "trialing",
      currentPeriodEnd: inDays(TRIAL_WARN_DAYS + 5),
    })

    const worklists = await readWorklists()

    expect(worklists.trials_ending.count).toBe(1)
    expect(worklists.trials_ending.items[0].organization.name).toBe("Bientôt")
  })

  it("lève les serveurs injoignables sur les alertes ouvertes, jamais sur celles qui sont closes", async () => {
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

  it("lève les organisations qui occupent plus de sièges qu'elles n'en paient", async () => {
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
    await createServer({ organizationId: drifted.organization.id })
    await createServer({ organizationId: drifted.organization.id })
    await createServer({ organizationId: fitting.organization.id })

    const worklists = await readWorklists()

    expect(worklists.seats_drifted.count).toBe(1)
    expect(worklists.seats_drifted.items[0]).toMatchObject({
      paid: 1,
      used: 2,
    })
    expect(worklists.seats_drifted.items[0].organization.name).toBe("Débordée")
  })

  it("refuse un anonyme", async () => {
    const response = await apiRequest("/admin/overview")

    expect(response.status).toBe(401)
  })
})
