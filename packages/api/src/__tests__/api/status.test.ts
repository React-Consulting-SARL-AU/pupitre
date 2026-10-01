import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { type AuthEnv, type AuthPrisma, createAuth } from "@pupitre/auth/server"
import { STATUS_STALE_AFTER_MS } from "@pupitre/shared/status"
import { configureAuth } from "../../lib/api/plugins/auth"
import { resetBilling } from "../../lib/billing/runtime"
import { readServiceStatus } from "../../lib/status/status"
import {
  type ApiTestServer,
  bootApiTestServer,
  resetDb,
  TEST_AUTH_ENV,
} from "../../testing"
import { useBillingOff, useFakeBilling } from "../../testing/billing"
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
    last_observation_at: string | null
    freshness: string
    checked_at: string
    social_providers: string[]
    billing: { mode: string }
  }
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T/

let harness: ApiTestServer

function statusRequest() {
  return apiRequest<StatusBody>("/status")
}

async function activeServerLastSeen(lastHeartbeatAt: Date | null) {
  const { organization } = await createOrganizationWithMembers({
    roles: ["owner"],
  })
  const { server } = await createServer({
    organizationId: organization.id,
    name: "vps-du-client",
  })

  await harness.prisma.server.update({
    where: { id: server.id },
    data: { lastHeartbeatAt },
  })

  return { organization, server }
}

describe("GET /status", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("answers without a session", async () => {
    const response = await statusRequest()

    expect(response.status).toBe(200)
    expect(response.json.data.api).toBe("ok")
    expect(response.json.data.database).toBe("ok")
    expect(response.json.data.checked_at).toMatch(ISO_DATE_RE)
  })

  it("states the billing mode", async () => {
    useBillingOff()

    const off = await statusRequest()

    expect(off.json.data.billing).toEqual({ mode: "off" })

    useFakeBilling()

    const stripe = await statusRequest()

    expect(stripe.json.data.billing).toEqual({ mode: "stripe" })
  })

  it("still answers when the billing mode is unreadable", async () => {
    const previous = process.env.BILLING_MODE

    resetBilling()
    process.env.BILLING_MODE = "launch"

    try {
      const response = await statusRequest()

      expect(response.status).toBe(200)
      expect(response.json.data.api).toBe("ok")
      expect(response.json.data.database).toBe("ok")
      expect(response.json.data.billing).toEqual({ mode: "off" })
    } finally {
      if (previous === undefined) {
        Reflect.deleteProperty(process.env, "BILLING_MODE")
      } else {
        process.env.BILLING_MODE = previous
      }

      useFakeBilling()
    }
  })

  it("counts the active servers without saying anything about them", async () => {
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

  it("names the latest release published on the stable channel", async () => {
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

  it("says nothing more than the service state", async () => {
    const response = await statusRequest()

    expect(Object.keys(response.json.data).sort()).toEqual([
      "active_servers",
      "api",
      "billing",
      "checked_at",
      "database",
      "freshness",
      "last_observation_at",
      "latest_release",
      "social_providers",
    ])
  })
})

describe("GET /status — freshness", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("claims to know nothing when no server has ever reported", async () => {
    const response = await statusRequest()

    expect(response.json.data.freshness).toBe("unknown")
    expect(response.json.data.last_observation_at).toBeNull()
  })

  it("calls an observation younger than the threshold fresh", async () => {
    const now = new Date("2026-09-04T12:00:00.000Z")

    await activeServerLastSeen(new Date(now.getTime() - STATUS_STALE_AFTER_MS))

    const status = await readServiceStatus(now)

    expect(status.freshness).toBe("fresh")
  })

  it("calls an observation older than the threshold stale", async () => {
    const now = new Date("2026-09-04T12:00:00.000Z")
    const lastSeen = new Date(now.getTime() - STATUS_STALE_AFTER_MS - 60_000)

    await activeServerLastSeen(lastSeen)

    const status = await readServiceStatus(now)

    expect(status.freshness).toBe("stale")
    expect(status.last_observation_at?.toISOString()).toBe(
      lastSeen.toISOString()
    )
  })

  it("keeps the most recent heartbeat of the fleet", async () => {
    const now = new Date("2026-09-04T12:00:00.000Z")
    const recent = new Date(now.getTime() - 60_000)

    await activeServerLastSeen(new Date(now.getTime() - 7_200_000))
    await activeServerLastSeen(recent)

    const status = await readServiceStatus(now)

    expect(status.freshness).toBe("fresh")
    expect(status.last_observation_at?.toISOString()).toBe(recent.toISOString())
  })

  it("says nothing about the server that produced the observation", async () => {
    const now = new Date("2026-09-04T12:00:00.000Z")
    const { organization, server } = await activeServerLastSeen(
      new Date(now.getTime() - 60_000)
    )
    const response = await statusRequest()
    const body = JSON.stringify(response.json)

    expect(response.json.data.last_observation_at).not.toBeNull()
    expect(body).not.toContain(server.id)
    expect(body).not.toContain(server.name)
    expect(body).not.toContain(organization.id)
    expect(body).not.toContain(organization.name)
    expect(body).not.toContain(organization.slug)
  })
})

describe("GET /status — the mounted sign-in providers", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  async function withAuthEnv<T>(
    env: Partial<AuthEnv>,
    read: () => Promise<T>
  ): Promise<T> {
    configureAuth(
      createAuth({
        prisma: harness.prisma as unknown as AuthPrisma,
        env: { ...TEST_AUTH_ENV, ...env },
      })
    )

    try {
      return await read()
    } finally {
      configureAuth(harness.auth)
    }
  }

  it("announces no provider when the environment configures none", async () => {
    const response = await statusRequest()

    expect(response.status).toBe(200)
    expect(response.json.data.social_providers).toEqual([])
  })

  it("announces the provider whose two variables are present", async () => {
    const response = await withAuthEnv(
      {
        GOOGLE_CLIENT_ID: "google-client-id",
        GOOGLE_CLIENT_SECRET: "google-client-secret",
      },
      statusRequest
    )

    expect(response.json.data.social_providers).toEqual(["google"])
  })

  it("keeps quiet about the half-configured provider", async () => {
    const response = await withAuthEnv(
      {
        GOOGLE_CLIENT_ID: "google-client-id",
        GITHUB_CLIENT_ID: "github-client-id",
        GITHUB_CLIENT_SECRET: "github-client-secret",
      },
      statusRequest
    )

    expect(response.json.data.social_providers).toEqual(["github"])
  })

  it("discloses no provider identifier or secret", async () => {
    const response = await withAuthEnv(
      {
        GOOGLE_CLIENT_ID: "google-client-id",
        GOOGLE_CLIENT_SECRET: "google-client-secret",
        GITHUB_CLIENT_ID: "github-client-id",
        GITHUB_CLIENT_SECRET: "github-client-secret",
      },
      statusRequest
    )
    const body = JSON.stringify(response.json)

    expect(response.json.data.social_providers).toEqual(["github", "google"])
    expect(body).not.toContain("client-id")
    expect(body).not.toContain("client-secret")
  })
})
