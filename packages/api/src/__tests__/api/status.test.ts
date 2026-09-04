import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { type ApiTestServer, bootApiTestServer, resetDb } from "../../testing"
import {
  createOrganizationWithMembers,
  createServer,
} from "../../testing/factories"
import { apiRequest } from "../../testing/request"

interface StatusBody {
  data: {
    api: string
    database: string
    latest_release: {
      version: string
      channel: string
      published_at: string
    } | null
    active_servers: number
    checked_at: string
  }
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T/

let harness: ApiTestServer

function statusRequest() {
  return apiRequest<StatusBody>("/status")
}

describe("GET /status", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("répond sans session", async () => {
    const response = await statusRequest()

    expect(response.status).toBe(200)
    expect(response.json.data.api).toBe("ok")
    expect(response.json.data.database).toBe("ok")
    expect(response.json.data.checked_at).toMatch(ISO_DATE_RE)
  })

  it("compte les serveurs actifs sans rien dire d'eux", async () => {
    const { organization, members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const { server } = await createServer({
      organizationId: organization.id,
      name: "vps-secret-du-client",
      assignedUserId: members[0].user.id,
    })

    await createServer({
      organizationId: organization.id,
      name: "vps-revoque",
      status: "revoked",
    })

    const response = await statusRequest()
    const body = JSON.stringify(response.json)

    expect(response.json.data.active_servers).toBe(1)
    expect(body).not.toContain(server.name)
    expect(body).not.toContain(server.id)
    expect(body).not.toContain(organization.id)
    expect(body).not.toContain(organization.name)
    expect(body).not.toContain(members[0].user.email)
    expect(body).not.toContain(members[0].user.id)
  })

  it("nomme la dernière release publiée sur le canal stable", async () => {
    for (const version of ["1.4.0", "1.6.0"]) {
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

    await harness.prisma.release.create({
      data: {
        version: "2.0.0",
        arch: "amd64",
        sha256: "sha-2",
        signature: "sig-2",
        r2Key: "agent/2.0.0/amd64",
        channel: "beta",
      },
    })

    const response = await statusRequest()

    expect(response.json.data.latest_release?.version).toBe("1.6.0")
    expect(response.json.data.latest_release?.channel).toBe("stable")
  })

  it("ne dit rien de plus que l'état du service", async () => {
    const response = await statusRequest()

    expect(Object.keys(response.json.data).sort()).toEqual([
      "active_servers",
      "api",
      "checked_at",
      "database",
      "latest_release",
    ])
  })
})
