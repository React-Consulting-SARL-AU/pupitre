import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { createApiClient } from "@pupitre/api/client"
import { bootApiTestServer, resetDb, TEST_BASE_URL } from "@pupitre/api/testing"
import { createServer } from "@pupitre/api/testing/factories"
import { setApiClient } from "@/lib/api/client"
import { STATUS_POLL_INTERVAL_MS, statusQueryOptions } from "@/lib/api/queries"
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
    const status = await readStatus()
    const body = JSON.stringify(status)

    expect(status.active_servers).toBe(1)
    expect(body).not.toContain(server.name)
    expect(body).not.toContain(server.id)
    expect(body).not.toContain(organization.name)
    expect(body).not.toContain(organization.id)
  })

  it("se rafraîchit toutes les trente secondes", () => {
    expect(statusQueryOptions().refetchInterval).toBe(STATUS_POLL_INTERVAL_MS)
    expect(STATUS_POLL_INTERVAL_MS).toBe(30_000)
  })
})
