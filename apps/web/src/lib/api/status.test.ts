import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { createApiClient } from "@pupitre/api/client"
import { bootApiTestServer, resetDb, TEST_BASE_URL } from "@pupitre/api/testing"
import { createServer } from "@pupitre/api/testing/factories"
import { STATUS_STALE_AFTER_MS } from "@pupitre/shared/status"
import { setApiClient } from "@/lib/api/client"
import { STATUS_POLL_INTERVAL_MS, statusQueryOptions } from "@/lib/api/queries"
import { freshnessNotice } from "@/lib/domain/service-status"
import { translator } from "@/lib/i18n/i18n"
import { createQueryClient } from "@/lib/query/client"

async function useAnonymousApiClient(): Promise<void> {
  const server = await bootApiTestServer()

  setApiClient(createApiClient(TEST_BASE_URL, { fetch: server.fetch }))
}

interface PublicStatus {
  api: string
  database: string
  active_servers: number
  latest_release: { version: string } | null
  last_observation_at: string | null
  freshness: string
}

async function readStatus(): Promise<PublicStatus> {
  const client = createQueryClient()

  return (await client.fetchQuery(statusQueryOptions())) as PublicStatus
}

describe("la page de statut", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    await useAnonymousApiClient()
  })

  it("se lit sans session", async () => {
    const status = await readStatus()

    expect(status.api).toBe("ok")
    expect(status.database).toBe("ok")
  })

  it("ne divulgue aucune donnée d'un client", async () => {
    const { prisma } = await bootApiTestServer()
    const organization = await prisma.organization.create({
      data: {
        id: crypto.randomUUID(),
        name: "Atelier Ferrand",
        slug: "atelier-ferrand",
        createdAt: new Date(),
      },
    })
    const { server } = await createServer({
      organizationId: organization.id,
      name: "vps-du-client",
    })

    await prisma.server.update({
      where: { id: server.id },
      data: { lastHeartbeatAt: new Date() },
    })

    const status = await readStatus()
    const body = JSON.stringify(status)

    expect(status.active_servers).toBe(1)
    expect(status.last_observation_at).not.toBeNull()
    expect(body).not.toContain(server.name)
    expect(body).not.toContain(server.id)
    expect(body).not.toContain(organization.name)
    expect(body).not.toContain(organization.id)
    expect(body).not.toContain(organization.slug)
  })

  it("dit que ses chiffres sont périmés au lieu de rassurer", async () => {
    const { prisma } = await bootApiTestServer()
    const organization = await prisma.organization.create({
      data: {
        id: crypto.randomUUID(),
        name: "Atelier Ferrand",
        slug: "atelier-ferrand-2",
        createdAt: new Date(),
      },
    })
    const { server } = await createServer({
      organizationId: organization.id,
      name: "vps-muet",
    })
    const now = new Date()
    const lastSeen = new Date(now.getTime() - STATUS_STALE_AFTER_MS - 3_600_000)

    await prisma.server.update({
      where: { id: server.id },
      data: { lastHeartbeatAt: lastSeen },
    })

    const status = await readStatus()
    const notice = freshnessNotice(
      status.freshness as "stale",
      status.last_observation_at,
      translator("fr"),
      now
    )

    expect(status.freshness).toBe("stale")
    expect(notice?.headline).toBe("Dernière observation il y a 1 h")
  })

  it("avoue ne rien savoir quand aucun serveur ne rapporte", async () => {
    const status = await readStatus()

    expect(status.freshness).toBe("unknown")
    expect(status.last_observation_at).toBeNull()
    expect(freshnessNotice("unknown", null, translator("fr"))?.headline).toBe(
      "Aucune observation à afficher"
    )
  })

  it("se rafraîchit toutes les trente secondes", () => {
    expect(statusQueryOptions().refetchInterval).toBe(STATUS_POLL_INTERVAL_MS)
    expect(STATUS_POLL_INTERVAL_MS).toBe(30_000)
  })
})
