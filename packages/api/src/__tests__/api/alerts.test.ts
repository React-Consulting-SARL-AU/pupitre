import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import type { EmailMessage } from "@pupitre/auth/server"
import type { Server } from "@pupitre/db/cloudflare/client"
import {
  activeAlertsFor,
  evaluateAlerts,
  evaluateServerAlerts,
} from "../../lib/alerts/alerts"
import { toStoredMetrics } from "../../lib/servers/metrics"
import { type ApiTestServer, bootApiTestServer, resetDb } from "../../testing"
import {
  createOrganizationWithMembers,
  createServer,
} from "../../testing/factories"
import { apiRequest } from "../../testing/request"

const MINUTE_MS = 60_000

let harness: ApiTestServer

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * MINUTE_MS)
}

function alertEmails(): EmailMessage[] {
  return harness.sentEmails
}

async function reload(serverId: string): Promise<Server> {
  const server = await harness.prisma.server.findUniqueOrThrow({
    where: { id: serverId },
  })

  return server as unknown as Server
}

async function silentServer(minutes: number) {
  const { organization, members } = await createOrganizationWithMembers({
    roles: ["owner"],
  })
  const [owner] = members
  const { server } = await createServer({
    organizationId: organization.id,
    assignedUserId: owner.user.id,
  })

  await harness.prisma.server.update({
    where: { id: server.id },
    data: { lastHeartbeatAt: minutesAgo(minutes) },
  })

  return { organization, owner, server: await reload(server.id) }
}

describe("le serveur injoignable", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("ouvre une alerte et envoie un email après trente minutes de silence", async () => {
    const { owner, server } = await silentServer(31)

    const verdict = await evaluateServerAlerts(server)

    expect(verdict.opened).toEqual(["server_unreachable"])

    const alerts = await harness.prisma.alert.findMany({
      where: { serverId: server.id },
    })

    expect(alerts).toHaveLength(1)
    expect(alerts[0].kind).toBe("server_unreachable")
    expect(alerts[0].firstSeenAt).toBeInstanceOf(Date)
    expect(alerts[0].notifiedAt).toBeInstanceOf(Date)
    expect(alerts[0].resolvedAt).toBeNull()

    const emails = alertEmails()

    expect(emails).toHaveLength(1)
    expect(emails[0].to).toBe(owner.user.email)
    expect(emails[0].subject).toContain(server.name)
  })

  it("ne renvoie rien à la deuxième évaluation du même état", async () => {
    const { server } = await silentServer(31)

    await evaluateServerAlerts(server)

    const before = alertEmails().length
    const second = await evaluateServerAlerts(await reload(server.id))

    expect(second.opened).toEqual([])
    expect(second.resolved).toEqual([])
    expect(alertEmails()).toHaveLength(before)
    expect(
      await harness.prisma.alert.count({ where: { serverId: server.id } })
    ).toBe(1)
  })

  it("repart après un retour à la normale suivi d'une nouvelle panne", async () => {
    const { server } = await silentServer(31)

    await evaluateServerAlerts(server)

    await harness.prisma.server.update({
      where: { id: server.id },
      data: { lastHeartbeatAt: new Date() },
    })

    const healed = await evaluateServerAlerts(await reload(server.id))

    expect(healed.resolved).toEqual(["server_unreachable"])
    expect(alertEmails()).toHaveLength(1)

    const resolved = await harness.prisma.alert.findFirstOrThrow({
      where: { serverId: server.id },
    })

    expect(resolved.resolvedAt).toBeInstanceOf(Date)

    await harness.prisma.server.update({
      where: { id: server.id },
      data: { lastHeartbeatAt: minutesAgo(40) },
    })

    const again = await evaluateServerAlerts(await reload(server.id))

    expect(again.opened).toEqual(["server_unreachable"])
    expect(alertEmails()).toHaveLength(2)
    expect(
      await harness.prisma.alert.count({
        where: { serverId: server.id, resolvedAt: null },
      })
    ).toBe(1)
  })
})

describe("les autres genres d'alerte", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("signale un disque au-dessus de 90 %", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const { server } = await createServer({
      organizationId: organization.id,
      assignedUserId: members[0].user.id,
    })

    await harness.prisma.server.update({
      where: { id: server.id },
      data: {
        lastHeartbeatAt: new Date(),
        metrics: toStoredMetrics([
          {
            at: new Date().toISOString(),
            disk: 94,
            ram: 40,
            load: 1,
            sessions: [],
            stack_version: null,
            modules: [],
          },
        ]),
      },
    })

    const verdict = await evaluateServerAlerts(await reload(server.id))

    expect(verdict.opened).toEqual(["disk_high"])
    expect(alertEmails().at(-1)?.text).toContain("94")
  })

  it("signale un agent périmé de deux versions", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const { server } = await createServer({
      organizationId: organization.id,
      assignedUserId: members[0].user.id,
    })

    for (const version of ["1.4.0", "1.5.0", "1.6.0"]) {
      await harness.prisma.release.create({
        data: {
          version,
          arch: "amd64",
          sha256: `sha-${version}`,
          signature: `sig-${version}`,
          r2Key: `agent/${version}/amd64`,
          channel: "stable",
        },
      })
    }

    await harness.prisma.server.update({
      where: { id: server.id },
      data: { lastHeartbeatAt: new Date(), agentVersion: "1.4.0" },
    })

    const verdict = await evaluateServerAlerts(await reload(server.id))

    expect(verdict.opened).toEqual(["agent_outdated"])
    expect(alertEmails().at(-1)?.text).toContain("1.6.0")
  })

  it("signale un droit d'usage en tolérance", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const { server } = await createServer({
      organizationId: organization.id,
      assignedUserId: members[0].user.id,
      status: "grace",
    })

    await harness.prisma.server.update({
      where: { id: server.id },
      data: {
        lastHeartbeatAt: new Date(),
        entitlementValidUntil: new Date(Date.now() + 86_400_000),
      },
    })

    const verdict = await evaluateServerAlerts(await reload(server.id))

    expect(verdict.opened).toEqual(["entitlement_grace"])
    expect(alertEmails()).toHaveLength(1)
  })
})

describe("le balayage de tous les serveurs", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("évalue chaque serveur en service et rend son verdict", async () => {
    const { server } = await silentServer(45)
    const runs = await evaluateAlerts()
    const run = runs.find((entry) => entry.serverId === server.id)

    expect(run?.opened).toEqual(["server_unreachable"])
  })

  it("liste les alertes actives par serveur", async () => {
    const { server } = await silentServer(45)

    await evaluateServerAlerts(server)

    const active = await activeAlertsFor([server.id])

    expect(active.get(server.id)?.map((alert) => alert.kind)).toEqual([
      "server_unreachable",
    ])
  })
})

describe("la console voit les alertes actives", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("les porte sur la fiche du serveur et dans la liste", async () => {
    const { owner, server } = await silentServer(45)

    await evaluateServerAlerts(server)

    const detail = await apiRequest<{ data: { alerts: { kind: string }[] } }>(
      `/servers/${server.id}`,
      { session: owner }
    )

    expect(detail.status).toBe(200)
    expect(detail.json.data.alerts.map((alert) => alert.kind)).toEqual([
      "server_unreachable",
    ])

    const list = await apiRequest<{
      data: { id: string; alerts: { kind: string }[] }[]
    }>("/servers", { session: owner })

    expect(list.status).toBe(200)
    expect(
      list.json.data.find((entry) => entry.id === server.id)?.alerts
    ).toHaveLength(1)
  })
})
