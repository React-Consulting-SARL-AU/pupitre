import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import {
  configureReleaseStorage,
  createLocalReleaseStorage,
  createR2ReleaseStorage,
} from "../../lib/releases/storage"
import { bootApiTestServer, resetDb } from "../../testing"
import {
  createOrganizationWithMembers,
  createServer,
} from "../../testing/factories"
import { ED25519_KEY } from "../../testing/keys"
import { PROBE_REPORT } from "../../testing/probe"
import { apiRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

interface ErrorBody {
  error: { code: string; message: string; fix?: string }
}

interface ReleaseBody {
  data: {
    version: string
    arch: string
    sha256: string
    signature: string
    r2_key: string
    channel: string
    published_at: string
  }
}

interface LatestBody {
  version: string
  arch: string
  sha256: string
  signature: string
}

interface StateBody {
  target_version: string | null
}

const SHA256 = "a".repeat(64)

const OTHER_SHA256 = "b".repeat(64)

const SIGNATURE = `${"A".repeat(86)}==`

const R2_CONFIG = {
  accountId: "acc123",
  accessKeyId: "AKIAEXAMPLE",
  secretAccessKey: "secret-example",
  bucketName: "pupitre-agent",
}

function publication(overrides: Record<string, unknown> = {}) {
  return {
    version: "1.4.0",
    arch: "amd64",
    sha256: SHA256,
    signature: SIGNATURE,
    r2_key: "agent/1.4.0/pupitred-linux-amd64",
    ...overrides,
  }
}

async function platformAdmin() {
  const { user } = await createUser({
    email: "support@pupitre.studio",
    role: "platform_admin",
  })

  return await createSession({ userId: user.id })
}

async function device() {
  const { user } = await createUser({ email: "jordan@test.local" })

  return await createSession({ userId: user.id })
}

function publish(
  session: { token: string },
  overrides: Record<string, unknown> = {}
) {
  return apiRequest<ReleaseBody & ErrorBody>("/admin/releases", {
    body: publication(overrides),
    session,
  })
}

function promote(
  session: { token: string },
  version: string,
  channel = "stable"
) {
  return apiRequest<ErrorBody>(`/admin/releases/${version}/promote`, {
    body: { channel },
    session,
  })
}

async function enroll() {
  const { members } = await createOrganizationWithMembers({ roles: ["owner"] })
  const [owner] = members
  const added = await apiRequest<{ data: { id: string } }>("/me/devices", {
    body: { name: "MacBook", public_key: ED25519_KEY },
    session: owner,
  })
  const enrolled = await apiRequest<{
    release: {
      version: string
      url: string
      sha256: string
      signature: string
      channel: string
    }
  }>("/servers/enroll", {
    body: {
      device_id: added.json.data.id,
      host: "vps.test",
      probe: PROBE_REPORT,
    },
    session: owner,
  })

  return enrolled.json
}

describe("releases", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
    configureReleaseStorage(createR2ReleaseStorage(R2_CONFIG))
  })

  describe("POST /admin/releases", () => {
    it("refuses an anonymous caller", async () => {
      const response = await apiRequest<ErrorBody>("/admin/releases", {
        body: publication(),
      })

      expect(response.status).toBe(401)
      expect(response.json.error.code).toBe("unauthenticated")
    })

    it("refuses a caller who is not a platform admin", async () => {
      const session = await device()
      const response = await publish(session)

      expect(response.status).toBe(403)
      expect(response.json.error.code).toBe("forbidden")
    })

    it("publishes in the beta channel by default", async () => {
      const { prisma } = await bootApiTestServer()
      const session = await platformAdmin()
      const response = await publish(session)

      expect(response.status).toBe(201)
      expect(response.json.data.channel).toBe("beta")
      expect(response.json.data.version).toBe("1.4.0")

      const stored = await prisma.release.findMany()

      expect(stored).toHaveLength(1)
      expect(stored[0]?.channel).toBe("beta")
    })

    it("records a release.published event", async () => {
      const { prisma } = await bootApiTestServer()
      const session = await platformAdmin()

      await publish(session)

      const events = await prisma.event.findMany({
        where: { action: "release.published" },
      })

      expect(events).toHaveLength(1)
      expect(events[0]?.targetId).toBe("1.4.0")
    })

    it("refuses a version that is not semver", async () => {
      const session = await platformAdmin()
      const response = await publish(session, { version: "v1.4" })

      expect(response.status).toBe(422)
      expect(response.json.error.code).toBe("validation")
    })

    it("refuses a malformed signature", async () => {
      const session = await platformAdmin()
      const response = await publish(session, { signature: "not-a-signature" })

      expect(response.status).toBe(422)
      expect(response.json.error.code).toBe("validation")
    })

    it("refuses a malformed sha256", async () => {
      const session = await platformAdmin()
      const response = await publish(session, { sha256: "deadbeef" })

      expect(response.status).toBe(422)
      expect(response.json.error.code).toBe("validation")
    })

    it("is idempotent on (version, arch)", async () => {
      const { prisma } = await bootApiTestServer()
      const session = await platformAdmin()

      const first = await publish(session)
      const second = await publish(session)

      expect(first.status).toBe(201)
      expect(second.status).toBe(200)
      expect(second.json.data.version).toBe(first.json.data.version)

      const stored = await prisma.release.findMany()

      expect(stored).toHaveLength(1)

      const events = await prisma.event.findMany({
        where: { action: "release.published" },
      })

      expect(events).toHaveLength(1)
    })

    it("keeps a promoted release in its channel when the CI publishes it again", async () => {
      const { prisma } = await bootApiTestServer()
      const session = await platformAdmin()

      await publish(session)
      await promote(session, "1.4.0")

      const again = await publish(session)

      expect(again.status).toBe(200)
      expect(again.json.data.channel).toBe("stable")

      const stored = await prisma.release.findMany()

      expect(stored).toHaveLength(1)
    })

    it("refuses the same version and arch with another fingerprint", async () => {
      const session = await platformAdmin()

      await publish(session)

      const response = await publish(session, { sha256: OTHER_SHA256 })

      expect(response.status).toBe(409)
      expect(response.json.error.code).toBe("conflict")
      expect(response.json.error.fix).toBeString()
    })

    it("keeps one row per architecture", async () => {
      const { prisma } = await bootApiTestServer()
      const session = await platformAdmin()

      await publish(session)
      await publish(session, {
        arch: "arm64",
        r2_key: "agent/1.4.0/pupitred-linux-arm64",
      })

      const stored = await prisma.release.findMany()

      expect(stored).toHaveLength(2)
    })
  })

  describe("POST /admin/releases/:version/promote", () => {
    it("refuses a caller who is not a platform admin", async () => {
      const session = await device()
      const response = await promote(session, "1.4.0")

      expect(response.status).toBe(403)
    })

    it("answers release_not_found for an unknown version", async () => {
      const session = await platformAdmin()
      const response = await promote(session, "9.9.9")

      expect(response.status).toBe(404)
      expect(response.json.error.code).toBe("release_not_found")
    })

    it("promotes every architecture of the version and records the event", async () => {
      const { prisma } = await bootApiTestServer()
      const session = await platformAdmin()

      await publish(session)
      await publish(session, {
        arch: "arm64",
        r2_key: "agent/1.4.0/pupitred-linux-arm64",
      })

      const response = await promote(session, "1.4.0")

      expect(response.status).toBe(200)

      const stored = await prisma.release.findMany({
        where: { version: "1.4.0" },
      })

      expect(stored.map((row) => row.channel).sort()).toEqual([
        "stable",
        "stable",
      ])

      const events = await prisma.event.findMany({
        where: { action: "release.promoted" },
      })

      expect(events).toHaveLength(1)
    })
  })

  describe("target version in /agent/state", () => {
    it("keeps a beta release out of a stable server's target, then hands it over once promoted", async () => {
      const admin = await platformAdmin()
      const { organization } = await createOrganizationWithMembers({
        roles: ["owner"],
      })
      const { token } = await createServer({
        organizationId: organization.id,
        arch: "amd64",
      })

      await publish(admin)

      const beforePromotion = await apiRequest<StateBody>("/agent/state", {
        bearer: token,
      })

      expect(beforePromotion.status).toBe(200)
      expect(beforePromotion.json.target_version).not.toBe("1.4.0")

      await promote(admin, "1.4.0")

      const afterPromotion = await apiRequest<StateBody>("/agent/state", {
        bearer: token,
      })

      expect(afterPromotion.json.target_version).toBe("1.4.0")
    })

    it("hands a beta release to a server on the beta channel", async () => {
      const { prisma } = await bootApiTestServer()
      const admin = await platformAdmin()
      const { organization } = await createOrganizationWithMembers({
        roles: ["owner"],
      })
      const { server, token } = await createServer({
        organizationId: organization.id,
        arch: "amd64",
      })

      await prisma.server.update({
        where: { id: server.id },
        data: { channel: "beta" },
      })
      await publish(admin)

      const response = await apiRequest<StateBody>("/agent/state", {
        bearer: token,
      })

      expect(response.json.target_version).toBe("1.4.0")
    })

    it("ignores a release published for another architecture", async () => {
      const admin = await platformAdmin()
      const { organization } = await createOrganizationWithMembers({
        roles: ["owner"],
      })
      const { token } = await createServer({
        organizationId: organization.id,
        arch: "arm64",
      })

      await publish(admin)
      await promote(admin, "1.4.0")

      const response = await apiRequest<StateBody>("/agent/state", {
        bearer: token,
      })

      expect(response.json.target_version).not.toBe("1.4.0")
    })

    it("never moves a server back to an older version", async () => {
      const { prisma } = await bootApiTestServer()
      const admin = await platformAdmin()
      const { organization } = await createOrganizationWithMembers({
        roles: ["owner"],
      })
      const { server, token } = await createServer({
        organizationId: organization.id,
        arch: "amd64",
      })

      await prisma.server.update({
        where: { id: server.id },
        data: { targetVersion: "2.0.0" },
      })
      await publish(admin)
      await promote(admin, "1.4.0")

      const response = await apiRequest<StateBody>("/agent/state", {
        bearer: token,
      })

      expect(response.json.target_version).toBe("2.0.0")
    })
  })

  describe("GET /agent/release/:version", () => {
    it("refuses a caller without a server token", async () => {
      const response = await apiRequest<ErrorBody>("/agent/release/1.4.0")

      expect(response.status).toBe(401)
      expect(response.json.error.code).toBe("unauthenticated")
    })

    it("redirects to a signed URL that expires", async () => {
      const admin = await platformAdmin()
      const { organization } = await createOrganizationWithMembers({
        roles: ["owner"],
      })
      const { token } = await createServer({
        organizationId: organization.id,
        arch: "amd64",
      })

      await publish(admin)

      const response = await apiRequest("/agent/release/1.4.0", {
        bearer: token,
      })

      expect(response.status).toBe(303)

      const location = new URL(response.raw.headers.get("location") ?? "")

      expect(location.hostname).toBe("acc123.r2.cloudflarestorage.com")
      expect(location.pathname).toBe(
        "/pupitre-agent/agent/1.4.0/pupitred-linux-amd64"
      )
      expect(location.searchParams.get("X-Amz-Expires")).toBe("300")
      expect(location.searchParams.get("X-Amz-Signature")).toBeString()
      expect(response.raw.headers.get("x-pupitre-release-storage")).toBe("r2")
      expect(response.raw.headers.get("cache-control")).toBe("no-store")
    })

    it("answers release_not_found for a version missing for this architecture", async () => {
      const admin = await platformAdmin()
      const { organization } = await createOrganizationWithMembers({
        roles: ["owner"],
      })
      const { token } = await createServer({
        organizationId: organization.id,
        arch: "arm64",
      })

      await publish(admin)

      const response = await apiRequest<ErrorBody>("/agent/release/1.4.0", {
        bearer: token,
      })

      expect(response.status).toBe(404)
      expect(response.json.error.code).toBe("release_not_found")
    })
  })

  describe("GET /releases/agent/:version", () => {
    it("refuses a caller without a device token", async () => {
      const response = await apiRequest<ErrorBody>("/releases/agent/1.4.0")

      expect(response.status).toBe(401)
      expect(response.json.error.code).toBe("unauthenticated")
    })

    it("redirects a device to a signed URL that expires", async () => {
      const admin = await platformAdmin()
      const session = await device()

      await publish(admin, {
        arch: "arm64",
        r2_key: "agent/1.4.0/pupitred-linux-arm64",
      })

      const response = await apiRequest("/releases/agent/1.4.0?arch=arm64", {
        session,
      })

      expect(response.status).toBe(303)

      const location = new URL(response.raw.headers.get("location") ?? "")

      expect(location.pathname).toBe(
        "/pupitre-agent/agent/1.4.0/pupitred-linux-arm64"
      )
      expect(Number(location.searchParams.get("X-Amz-Expires"))).toBe(300)
    })

    it("says the URL is local when the bucket is not configured", async () => {
      configureReleaseStorage(createLocalReleaseStorage())

      const admin = await platformAdmin()
      const session = await device()

      await publish(admin)

      const response = await apiRequest<string>("/releases/agent/1.4.0", {
        session,
      })

      expect(response.status).toBe(303)
      expect(response.raw.headers.get("x-pupitre-release-storage")).toBe(
        "local"
      )
      expect(response.json).toContain("R2")

      const location = new URL(response.raw.headers.get("location") ?? "")

      expect(location.hostname).toBe("localhost")
      expect(Number(location.searchParams.get("expires"))).toBeGreaterThan(
        Math.floor(Date.now() / 1000)
      )
    })

    it("answers release_not_found for an unknown version", async () => {
      const session = await device()
      const response = await apiRequest<ErrorBody>("/releases/agent/9.9.9", {
        session,
      })

      expect(response.status).toBe(404)
      expect(response.json.error.code).toBe("release_not_found")
    })
  })

  describe("GET /releases/agent/latest", () => {
    it("refuses a caller without a device token", async () => {
      const response = await apiRequest<ErrorBody>("/releases/agent/latest")

      expect(response.status).toBe(401)
    })

    it("answers release_not_found while the channel is empty", async () => {
      const session = await device()
      const response = await apiRequest<ErrorBody>("/releases/agent/latest", {
        session,
      })

      expect(response.status).toBe(404)
      expect(response.json.error.code).toBe("release_not_found")
    })

    it("hands the latest promoted version of the stable channel", async () => {
      const admin = await platformAdmin()
      const session = await device()

      await publish(admin, { version: "1.4.0" })
      await publish(admin, {
        version: "1.10.0",
        r2_key: "agent/1.10.0/pupitred-linux-amd64",
      })
      await promote(admin, "1.4.0")

      const stable = await apiRequest<LatestBody>("/releases/agent/latest", {
        session,
      })

      expect(stable.status).toBe(200)
      expect(stable.json).toEqual({
        version: "1.4.0",
        arch: "amd64",
        sha256: SHA256,
        signature: SIGNATURE,
      })

      const beta = await apiRequest<LatestBody>(
        "/releases/agent/latest?channel=beta",
        { session }
      )

      expect(beta.json.version).toBe("1.10.0")
    })
  })

  describe("enrollment", () => {
    it("hands the latest stable release and says which channel it comes from", async () => {
      const admin = await platformAdmin()

      await publish(admin, { version: "1.4.0" })
      await promote(admin, "1.4.0")
      await publish(admin, {
        version: "1.5.0",
        r2_key: "agent/1.5.0/pupitred-linux-amd64",
      })

      const enrolled = await enroll()

      expect(enrolled.release.version).toBe("1.4.0")
      expect(enrolled.release.channel).toBe("stable")
      expect(enrolled.release.sha256).toBe(SHA256)
      expect(enrolled.release.signature).toBe(SIGNATURE)
      expect(new URL(enrolled.release.url).hostname).toBe(
        "acc123.r2.cloudflarestorage.com"
      )
    })

    it("falls back to the latest beta and says so when no stable exists", async () => {
      const admin = await platformAdmin()

      await publish(admin, { version: "1.5.0" })

      const enrolled = await enroll()

      expect(enrolled.release.version).toBe("1.5.0")
      expect(enrolled.release.channel).toBe("beta")
    })
  })
})
