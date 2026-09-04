import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { bootApiTestServer, resetDb } from "../../testing"
import {
  createOrganizationWithMembers,
  createServer,
} from "../../testing/factories"
import { apiRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

const SHA256 = "d".repeat(64)

const SIGNATURE = `${"D".repeat(86)}==`

const VERSION = "1.4.0"

interface MetadataBody {
  version: string
  arch: string
  sha256: string
  signature: string
  channel: string
}

interface StateBody {
  target_version: string | null
  minimum_version: string | null
}

interface ErrorBody {
  error: { code: string; message: string; fix?: string }
}

const HEARTBEAT = {
  disk: 40,
  ram: 50,
  load: 0.4,
  sessions: [],
  stack_version: VERSION,
  modules: [],
}

async function platformAdmin() {
  const { user } = await createUser({
    email: "support@pupitre.studio",
    role: "platform_admin",
  })

  return await createSession({ userId: user.id })
}

async function publish(session: { token: string }, arch: string) {
  return await apiRequest("/admin/releases", {
    body: {
      version: VERSION,
      arch,
      sha256: SHA256,
      signature: SIGNATURE,
      r2_key: `agent/${VERSION}/pupitred-linux-${arch}`,
      channel: "stable",
    },
    session,
  })
}

async function enrolledServer(arch = "amd64") {
  const { organization } = await createOrganizationWithMembers({
    roles: ["owner"],
  })

  return await createServer({ organizationId: organization.id, arch })
}

describe("GET /agent/release/:version/metadata", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("hands the agent the fingerprint and the signature of its architecture", async () => {
    const admin = await platformAdmin()

    await publish(admin, "amd64")

    const { token } = await enrolledServer("amd64")
    const response = await apiRequest<MetadataBody>(
      `/agent/release/${VERSION}/metadata`,
      { bearer: token }
    )

    expect(response.status).toBe(200)
    expect(response.json).toEqual({
      version: VERSION,
      arch: "amd64",
      sha256: SHA256,
      signature: SIGNATURE,
      channel: "stable",
    })
  })

  it("refuses a version published for another architecture", async () => {
    const admin = await platformAdmin()

    await publish(admin, "amd64")

    const { token } = await enrolledServer("arm64")
    const response = await apiRequest<ErrorBody>(
      `/agent/release/${VERSION}/metadata`,
      { bearer: token }
    )

    expect(response.status).toBe(404)
    expect(response.json.error.code).toBe("release_not_found")
    expect(response.json.error.fix).toBeString()
  })

  it("refuses a caller without a server token", async () => {
    const admin = await platformAdmin()

    await publish(admin, "amd64")

    const response = await apiRequest<ErrorBody>(
      `/agent/release/${VERSION}/metadata`
    )

    expect(response.status).toBe(401)
    expect(response.json.error.code).toBe("unauthenticated")
  })
})

describe("GET /agent/state, minimum_version", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("announces no floor for a server never seen running", async () => {
    const { token } = await enrolledServer()
    const response = await apiRequest<StateBody>("/agent/state", {
      bearer: token,
    })

    expect(response.status).toBe(200)
    expect(response.json.minimum_version).toBeNull()
  })

  it("announces the last version the platform saw this server run", async () => {
    const { token } = await enrolledServer()

    await apiRequest("/agent/heartbeat", {
      body: { ...HEARTBEAT, agent_version: VERSION },
      bearer: token,
    })

    const response = await apiRequest<StateBody>("/agent/state", {
      bearer: token,
    })

    expect(response.json.minimum_version).toBe(VERSION)
  })
})
