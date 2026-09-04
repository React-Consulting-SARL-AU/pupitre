import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { bootApiTestServer, resetDb } from "../../testing"
import { apiRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

interface ErrorBody {
  error: { code: string; message: string; fix?: string }
}

interface BuildBody {
  data: {
    version: string
    os: string
    arch: string | null
    url: string
    sha256: string
    signature: string | null
    notes: string
    channel: string
    published_at: string
  }
}

interface ReleaseBody {
  data: {
    version: string
    channel: string
    notes: string
    published_at: string
    builds: { os: string; arch: string | null; url: string }[]
  }
}

const SHA256 = "a".repeat(64)

const OTHER_SHA256 = "b".repeat(64)

const NOTES = "Première version signée : onboarding, catalogue, terminaux."

function publication(overrides: Record<string, unknown> = {}) {
  return {
    version: "1.4.0",
    os: "macos",
    url: "https://downloads.pupitre.studio/1.4.0/Pupitre-1.4.0.dmg",
    sha256: SHA256,
    notes: NOTES,
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

async function member() {
  const { user } = await createUser({ email: "jordan@test.local" })

  return await createSession({ userId: user.id })
}

function publish(
  session: { token: string },
  overrides: Record<string, unknown> = {}
) {
  return apiRequest<BuildBody & ErrorBody>("/admin/app-releases", {
    body: publication(overrides),
    session,
  })
}

async function publishEveryOs(
  session: { token: string },
  channel = "stable",
  version = "1.4.0"
) {
  await publish(session, { version, channel })
  await publish(session, {
    version,
    channel,
    os: "windows",
    url: `https://downloads.pupitre.studio/${version}/Pupitre-Setup-${version}.exe`,
  })
  await publish(session, {
    version,
    channel,
    os: "linux",
    url: `https://downloads.pupitre.studio/${version}/Pupitre-${version}.AppImage`,
  })
}

describe("app releases", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  describe("POST /admin/app-releases", () => {
    it("refuses an anonymous caller", async () => {
      const response = await apiRequest<ErrorBody>("/admin/app-releases", {
        body: publication(),
      })

      expect(response.status).toBe(401)
      expect(response.json.error.code).toBe("unauthenticated")
    })

    it("refuses a caller who is not a platform admin", async () => {
      const session = await member()
      const response = await publish(session)

      expect(response.status).toBe(403)
      expect(response.json.error.code).toBe("forbidden")
    })

    it("publishes in the beta channel by default, without arch nor signature", async () => {
      const { prisma } = await bootApiTestServer()
      const session = await platformAdmin()
      const response = await publish(session)

      expect(response.status).toBe(201)
      expect(response.json.data.channel).toBe("beta")
      expect(response.json.data.os).toBe("macos")
      expect(response.json.data.arch).toBeNull()
      expect(response.json.data.signature).toBeNull()
      expect(response.json.data.notes).toBe(NOTES)

      const stored = await prisma.appRelease.findMany()

      expect(stored).toHaveLength(1)
    })

    it("records an app_release.published event", async () => {
      const { prisma } = await bootApiTestServer()
      const session = await platformAdmin()

      await publish(session)

      const events = await prisma.event.findMany({
        where: { action: "app_release.published" },
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

    it("refuses an unknown system, a broken digest and empty notes", async () => {
      const session = await platformAdmin()

      expect((await publish(session, { os: "freebsd" })).status).toBe(422)
      expect((await publish(session, { sha256: "deadbeef" })).status).toBe(422)
      expect((await publish(session, { notes: "" })).status).toBe(422)
    })

    it("is idempotent on (version, os)", async () => {
      const { prisma } = await bootApiTestServer()
      const session = await platformAdmin()

      const first = await publish(session)
      const second = await publish(session)

      expect(first.status).toBe(201)
      expect(second.status).toBe(200)

      const stored = await prisma.appRelease.findMany()

      expect(stored).toHaveLength(1)
    })

    it("refuses the same version and system with another fingerprint", async () => {
      const session = await platformAdmin()

      await publish(session)

      const response = await publish(session, { sha256: OTHER_SHA256 })

      expect(response.status).toBe(409)
      expect(response.json.error.code).toBe("conflict")
      expect(response.json.error.fix).toBeString()
    })

    it("keeps one row per system", async () => {
      const { prisma } = await bootApiTestServer()
      const session = await platformAdmin()

      await publishEveryOs(session)

      const stored = await prisma.appRelease.findMany()

      expect(stored).toHaveLength(3)
    })
  })

  describe("GET /releases/app/latest", () => {
    it("refuses an anonymous caller", async () => {
      const response = await apiRequest<ErrorBody>("/releases/app/latest")

      expect(response.status).toBe(401)
    })

    it("says nothing is published rather than inventing a version", async () => {
      const session = await member()
      const response = await apiRequest<ErrorBody>("/releases/app/latest", {
        session,
      })

      expect(response.status).toBe(404)
      expect(response.json.error.code).toBe("app_release_not_found")
      expect(response.json.error.fix).toBeString()
    })

    it("returns the three systems of the newest version with its notes", async () => {
      const admin = await platformAdmin()

      await publishEveryOs(admin, "stable", "1.3.0")
      await publishEveryOs(admin, "stable", "1.4.0")

      const session = await member()
      const response = await apiRequest<ReleaseBody>("/releases/app/latest", {
        session,
      })

      expect(response.status).toBe(200)
      expect(response.json.data.version).toBe("1.4.0")
      expect(response.json.data.notes).toBe(NOTES)
      expect(response.json.data.builds.map((build) => build.os).sort()).toEqual(
        ["linux", "macos", "windows"]
      )
    })

    it("hides a beta version from the stable channel", async () => {
      const admin = await platformAdmin()

      await publishEveryOs(admin, "stable", "1.3.0")
      await publishEveryOs(admin, "beta", "1.4.0")

      const session = await member()
      const stable = await apiRequest<ReleaseBody>("/releases/app/latest", {
        session,
      })
      const beta = await apiRequest<ReleaseBody>(
        "/releases/app/latest?channel=beta",
        { session }
      )

      expect(stable.json.data.version).toBe("1.3.0")
      expect(beta.json.data.version).toBe("1.4.0")
    })
  })

  describe("GET /releases/app/:version", () => {
    it("answers app_release_not_found for an unknown version", async () => {
      const session = await member()
      const response = await apiRequest<ErrorBody>("/releases/app/9.9.9", {
        session,
      })

      expect(response.status).toBe(404)
      expect(response.json.error.code).toBe("app_release_not_found")
    })

    it("returns a past version even when it is no longer the latest", async () => {
      const admin = await platformAdmin()

      await publishEveryOs(admin, "stable", "1.3.0")
      await publishEveryOs(admin, "stable", "1.4.0")

      const session = await member()
      const response = await apiRequest<ReleaseBody>("/releases/app/1.3.0", {
        session,
      })

      expect(response.status).toBe(200)
      expect(response.json.data.version).toBe("1.3.0")
      expect(response.json.data.builds).toHaveLength(3)
    })
  })
})
