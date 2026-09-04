import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import {
  configureReleaseStorage,
  createR2ReleaseStorage,
} from "../../lib/releases/storage"
import { bootApiTestServer, resetDb } from "../../testing"
import { createOrganizationWithMembers } from "../../testing/factories"
import { ED25519_KEY } from "../../testing/keys"
import { apiRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

const SHA256 = "c".repeat(64)

const SIGNATURE = `${"C".repeat(86)}==`

const R2_CONFIG = {
  accountId: "acc123",
  accessKeyId: "AKIAEXAMPLE",
  secretAccessKey: "secret-example",
  bucketName: "pupitre-agent",
}

async function platformAdmin() {
  const { user } = await createUser({
    email: "support@pupitre.studio",
    role: "platform_admin",
  })

  return await createSession({ userId: user.id })
}

async function appDevice() {
  const { members } = await createOrganizationWithMembers({ roles: ["owner"] })
  const [owner] = members

  const added = await apiRequest<{ data: { id: string } }>("/me/devices", {
    body: { name: "MacBook", public_key: ED25519_KEY },
    session: owner,
  })

  return { session: owner, deviceId: added.json.data.id }
}

async function publishAmd64(session: { token: string }) {
  return await apiRequest("/admin/releases", {
    body: {
      version: "1.4.0",
      arch: "amd64",
      sha256: SHA256,
      signature: SIGNATURE,
      r2_key: "agent/1.4.0/pupitred-linux-amd64",
      channel: "beta",
    },
    session,
  })
}

describe("AGT-15 distribution", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    configureReleaseStorage(createR2ReleaseStorage(R2_CONFIG))
  })

  it("hands a published binary to the app carrying a device token", async () => {
    const admin = await platformAdmin()
    const { session } = await appDevice()

    await publishAmd64(admin)

    const download = await apiRequest("/releases/agent/1.4.0?arch=amd64", {
      session,
    })

    expect(download.status).toBe(303)

    const location = new URL(download.raw.headers.get("location") ?? "")

    expect(location.pathname).toBe(
      "/pupitre-agent/agent/1.4.0/pupitred-linux-amd64"
    )
    expect(Number(location.searchParams.get("X-Amz-Expires"))).toBe(300)
    expect(location.searchParams.get("X-Amz-Signature")).toBeString()
  })

  it("refuses the same binary to a caller without a device token", async () => {
    const admin = await platformAdmin()

    await publishAmd64(admin)

    const download = await apiRequest<{ error: { code: string } }>(
      "/releases/agent/1.4.0?arch=amd64"
    )

    expect(download.status).toBe(401)
    expect(download.json.error.code).toBe("unauthenticated")
    expect(download.raw.headers.get("location")).toBeNull()
  })
})
