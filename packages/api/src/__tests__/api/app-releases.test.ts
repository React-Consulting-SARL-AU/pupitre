import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test"
import { CLIENT_IP_HEADER } from "@pupitre/auth/server"
import { PUBLIC_RELEASES_RATE_LIMIT } from "../../lib/api/rate-limit"
import {
  PUBLISH_TOKEN_PREFIX,
  PUBLISH_TOKEN_VARIABLE,
} from "../../lib/releases/publish-token"
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
    arch: string
    format: string
    url: string
    bytes: number
    sha256: string
    signature: string | null
    notes: string
    channel: string
    published_at: string
  }
}

interface Release {
  version: string
  channel: string
  notes: string
  published_at: string
  builds: { os: string; arch: string; format: string; url: string }[]
}

interface ReleaseBody {
  data: Release
}

interface ReleaseListBody {
  data: Release[]
}

const SHA256 = "a".repeat(64)

const OTHER_SHA256 = "b".repeat(64)

const NOTES = "Première version signée : onboarding, catalogue, terminaux."

const SIGNATURE = `${"c".repeat(86)}==`

// Base of a published address when no downloads bucket is configured.
const DOWNLOADS = "http://localhost/__downloads"

function publication(overrides: Record<string, unknown> = {}) {
  return {
    version: "1.4.0",
    os: "macos",
    arch: "arm64",
    format: "dmg",
    r2_key: "app/1.4.0/Pupitre-1.4.0-arm64.dmg",
    bytes: 118_000_000,
    sha256: SHA256,
    signature: SIGNATURE,
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
    arch: "x64",
    r2_key: `app/${version}/Pupitre-${version}-x64.dmg`,
  })
  await publish(session, {
    version,
    channel,
    os: "windows",
    arch: "x64",
    format: "exe",
    r2_key: `app/${version}/Pupitre-Setup-${version}.exe`,
  })
  await publish(session, {
    version,
    channel,
    os: "linux",
    arch: "x64",
    format: "AppImage",
    r2_key: `app/${version}/Pupitre-${version}.AppImage`,
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

    it("publishes in the beta channel by default", async () => {
      const { prisma } = await bootApiTestServer()
      const session = await platformAdmin()
      const response = await publish(session)

      expect(response.status).toBe(201)
      expect(response.json.data.channel).toBe("beta")
      expect(response.json.data.os).toBe("macos")
      expect(response.json.data.arch).toBe("arm64")
      expect(response.json.data.format).toBe("dmg")
      expect(response.json.data.signature).toBe(SIGNATURE)
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
      expect((await publish(session, { signature: undefined })).status).toBe(
        422
      )
    })

    it("refuses a build without architecture, format or size", async () => {
      const session = await platformAdmin()

      expect((await publish(session, { arch: undefined })).status).toBe(422)
      expect((await publish(session, { format: undefined })).status).toBe(422)
      expect((await publish(session, { bytes: 0 })).status).toBe(422)
    })

    it("keeps the two architectures of the same system apart", async () => {
      const { prisma } = await bootApiTestServer()
      const session = await platformAdmin()

      await publish(session)
      await publish(session, {
        arch: "x64",
        r2_key: "app/1.4.0/Pupitre-1.4.0-x64.dmg",
      })

      const stored = await prisma.appRelease.findMany()

      expect(stored).toHaveLength(2)
    })

    it("keeps the two formats Linux ships for one machine apart", async () => {
      const { prisma } = await bootApiTestServer()
      const session = await platformAdmin()

      const appImage = await publish(session, {
        os: "linux",
        arch: "x64",
        format: "AppImage",
        r2_key: "app/1.4.0/Pupitre-1.4.0-x86_64.AppImage",
      })
      const deb = await publish(session, {
        os: "linux",
        arch: "x64",
        format: "deb",
        r2_key: "app/1.4.0/pupitre_1.4.0_amd64.deb",
        sha256: OTHER_SHA256,
      })

      expect(appImage.status).toBe(201)
      expect(deb.status).toBe(201)
      expect(await prisma.appRelease.findMany()).toHaveLength(2)
    })

    it("is idempotent on (version, os, arch, format)", async () => {
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

    it("keeps one row per artefact", async () => {
      const { prisma } = await bootApiTestServer()
      const session = await platformAdmin()

      await publishEveryOs(session)

      const stored = await prisma.appRelease.findMany()

      expect(stored).toHaveLength(4)
    })
  })

  describe("the publish token", () => {
    const TOKEN = `${PUBLISH_TOKEN_PREFIX}pipeline-token-for-the-tests`
    let held: string | undefined

    beforeEach(() => {
      held = process.env[PUBLISH_TOKEN_VARIABLE]
      process.env[PUBLISH_TOKEN_VARIABLE] = TOKEN
    })

    afterEach(() => {
      if (held === undefined) {
        process.env[PUBLISH_TOKEN_VARIABLE] = undefined
      } else {
        process.env[PUBLISH_TOKEN_VARIABLE] = held
      }
    })

    it("opens publishing without a session", async () => {
      const response = await apiRequest<BuildBody & ErrorBody>(
        "/admin/app-releases",
        { body: publication(), bearer: TOKEN }
      )

      expect(response.status).toBe(201)
      expect(response.json.data.version).toBe("1.4.0")
    })

    it("names the pipeline rather than a user in the log", async () => {
      const { prisma } = await bootApiTestServer()

      await apiRequest("/admin/app-releases", {
        body: publication(),
        bearer: TOKEN,
      })

      const [event] = await prisma.event.findMany({
        where: { action: "app_release.published" },
      })

      expect(event?.actorUserId).toBeNull()
      expect(event?.payload).toMatchObject({ by: "pipeline" })
    })

    it("refuses a token that is not the right one", async () => {
      const response = await apiRequest<ErrorBody>("/admin/app-releases", {
        body: publication(),
        bearer: `${PUBLISH_TOKEN_PREFIX}autre-chose`,
      })

      expect(response.status).toBe(401)
      expect(response.json.error.code).toBe("unauthenticated")
    })

    it("refuses any token when the platform declares none", async () => {
      process.env[PUBLISH_TOKEN_VARIABLE] = undefined

      const response = await apiRequest<ErrorBody>("/admin/app-releases", {
        body: publication(),
        bearer: TOKEN,
      })

      expect(response.status).toBe(401)
    })

    it("lets the console publish with its session", async () => {
      const session = await platformAdmin()

      expect((await publish(session)).status).toBe(201)
    })
  })

  describe("the artifact key", () => {
    it("refuses a key that would escape the versions folder", async () => {
      const session = await platformAdmin()

      for (const r2_key of [
        "//evil.example/Pupitre.dmg",
        "/app/1.4.0/Pupitre.dmg",
        "app/1.4.0/../../../etc/passwd",
        "../app/1.4.0/Pupitre.dmg",
        "https://evil.example/Pupitre.dmg",
        "agent/1.4.0/pupitred-linux-amd64",
      ]) {
        expect((await publish(session, { r2_key })).status).toBe(422)
      }
    })

    it("composes the address from the bucket, never from the caller", async () => {
      const session = await platformAdmin()

      await publish(session)

      const response = await apiRequest<ReleaseBody>("/releases/app/1.4.0")

      expect(response.json.data.builds[0]?.url).toBe(
        `${DOWNLOADS}/app/1.4.0/Pupitre-1.4.0-arm64.dmg`
      )
    })
  })

  describe("POST /admin/app-releases/:version/promote", () => {
    it("moves every artefact of a version to the stable channel", async () => {
      const admin = await platformAdmin()

      await publishEveryOs(admin, "beta", "1.4.0")

      const promoted = await apiRequest<ReleaseBody & ErrorBody>(
        "/admin/app-releases/1.4.0/promote",
        { body: { channel: "stable" }, session: admin }
      )

      expect(promoted.status).toBe(200)
      expect(promoted.json.data.channel).toBe("stable")

      const stable = await apiRequest<ReleaseBody>("/releases/app/latest")

      expect(stable.json.data.version).toBe("1.4.0")
    })

    it("demotes the newer stable versions so the download page rolls back too", async () => {
      const admin = await platformAdmin()

      await publishEveryOs(admin, "stable", "1.4.0")
      await publishEveryOs(admin, "stable", "1.5.0")

      const rolledBack = await apiRequest<ReleaseBody & ErrorBody>(
        "/admin/app-releases/1.4.0/promote",
        { body: { channel: "stable" }, session: admin }
      )

      expect(rolledBack.status).toBe(200)

      const stable = await apiRequest<ReleaseBody>("/releases/app/latest")
      const beta = await apiRequest<ReleaseBody>(
        "/releases/app/latest?channel=beta"
      )

      expect(stable.json.data.version).toBe("1.4.0")
      expect(beta.json.data.version).toBe("1.5.0")
      expect(beta.json.data.channel).toBe("beta")
    })

    it("refuses a caller who is not a platform admin", async () => {
      const session = await member()
      const response = await apiRequest<ErrorBody>(
        "/admin/app-releases/1.4.0/promote",
        { body: { channel: "stable" }, session }
      )

      expect(response.status).toBe(403)
    })

    it("answers app_release_not_found for a version nobody published", async () => {
      const admin = await platformAdmin()
      const response = await apiRequest<ErrorBody>(
        "/admin/app-releases/9.9.9/promote",
        { body: { channel: "stable" }, session: admin }
      )

      expect(response.status).toBe(404)
    })
  })

  describe("GET /releases/app", () => {
    it("lists the published versions, newest first, without a session", async () => {
      const admin = await platformAdmin()

      await publishEveryOs(admin, "stable", "1.3.0")
      await publishEveryOs(admin, "stable", "1.4.0")

      const response = await apiRequest<ReleaseListBody>("/releases/app")

      expect(response.status).toBe(200)
      expect(response.json.data.map((release) => release.version)).toEqual([
        "1.4.0",
        "1.3.0",
      ])
      expect(response.json.data[0]?.builds).toHaveLength(4)
    })

    it("answers an empty list rather than an error when nothing is published", async () => {
      const response = await apiRequest<ReleaseListBody>("/releases/app")

      expect(response.status).toBe(200)
      expect(response.json.data).toEqual([])
    })
  })

  describe("GET /releases/app/:version/:os/:arch", () => {
    it("redirects to the artefact of that architecture", async () => {
      const admin = await platformAdmin()

      await publishEveryOs(admin, "stable", "1.4.0")

      const response = await apiRequest<ErrorBody>(
        "/releases/app/1.4.0/macos/x64"
      )

      expect(response.status).toBe(303)
      expect(response.raw.headers.get("location")).toBe(
        `${DOWNLOADS}/app/1.4.0/Pupitre-1.4.0-x64.dmg`
      )
    })

    it("answers app_release_not_found for an architecture nobody built", async () => {
      const admin = await platformAdmin()

      await publishEveryOs(admin, "stable", "1.4.0")

      const response = await apiRequest<ErrorBody>(
        "/releases/app/1.4.0/windows/arm64"
      )

      expect(response.status).toBe(404)
    })

    it("sends Linux to the AppImage unless the .deb is asked for", async () => {
      const admin = await platformAdmin()

      await publishEveryOs(admin, "stable", "1.4.0")
      await publish(admin, {
        version: "1.4.0",
        channel: "stable",
        os: "linux",
        arch: "x64",
        format: "deb",
        r2_key: "app/1.4.0/pupitre_1.4.0_amd64.deb",
        sha256: OTHER_SHA256,
      })

      const appImage = await apiRequest<ErrorBody>(
        "/releases/app/1.4.0/linux/x64"
      )
      const deb = await apiRequest<ErrorBody>(
        "/releases/app/1.4.0/linux/x64?format=deb"
      )
      const unknown = await apiRequest<ErrorBody>(
        "/releases/app/1.4.0/linux/x64?format=rpm"
      )

      expect(appImage.raw.headers.get("location")).toBe(
        `${DOWNLOADS}/app/1.4.0/Pupitre-1.4.0.AppImage`
      )
      expect(deb.raw.headers.get("location")).toBe(
        `${DOWNLOADS}/app/1.4.0/pupitre_1.4.0_amd64.deb`
      )
      expect(unknown.status).toBe(404)
    })
  })

  describe("GET /releases/app/latest", () => {
    it("says nothing is published rather than inventing a version", async () => {
      const response = await apiRequest<ErrorBody>("/releases/app/latest")

      expect(response.status).toBe(404)
      expect(response.json.error.code).toBe("app_release_not_found")
      expect(response.json.error.fix).toBeString()
    })

    it("returns the three systems of the newest version with its notes", async () => {
      const admin = await platformAdmin()

      await publishEveryOs(admin, "stable", "1.3.0")
      await publishEveryOs(admin, "stable", "1.4.0")

      const response = await apiRequest<ReleaseBody>("/releases/app/latest")

      expect(response.status).toBe(200)
      expect(response.json.data.version).toBe("1.4.0")
      expect(response.json.data.notes).toBe(NOTES)
      expect(
        [...new Set(response.json.data.builds.map((build) => build.os))].sort()
      ).toEqual(["linux", "macos", "windows"])
    })

    it("hides a beta version from the stable channel", async () => {
      const admin = await platformAdmin()

      await publishEveryOs(admin, "stable", "1.3.0")
      await publishEveryOs(admin, "beta", "1.4.0")

      const stable = await apiRequest<ReleaseBody>("/releases/app/latest")
      const beta = await apiRequest<ReleaseBody>(
        "/releases/app/latest?channel=beta"
      )

      expect(stable.json.data.version).toBe("1.3.0")
      expect(beta.json.data.version).toBe("1.4.0")
    })
  })

  describe("GET /releases/app/:version", () => {
    it("answers app_release_not_found for an unknown version", async () => {
      const response = await apiRequest<ErrorBody>("/releases/app/9.9.9")

      expect(response.status).toBe(404)
      expect(response.json.error.code).toBe("app_release_not_found")
    })

    it("returns a past version even when it is no longer the latest", async () => {
      const admin = await platformAdmin()

      await publishEveryOs(admin, "stable", "1.3.0")
      await publishEveryOs(admin, "stable", "1.4.0")

      const response = await apiRequest<ReleaseBody>("/releases/app/1.3.0")

      expect(response.status).toBe(200)
      expect(response.json.data.version).toBe("1.3.0")
      expect(response.json.data.builds).toHaveLength(4)
    })
  })

  describe("public reading", () => {
    it("answers any origin and can be cached", async () => {
      const response = await apiRequest<ReleaseListBody>("/releases/app")

      expect(response.raw.headers.get("access-control-allow-origin")).toBe("*")
      expect(response.raw.headers.get("cache-control")).toContain("max-age=300")
    })

    it("cuts off an address that exceeds its budget, without touching the others", async () => {
      const flooding = { [CLIENT_IP_HEADER]: "203.0.113.7" }
      const statuses = new Set<number>()

      for (
        let attempt = 0;
        attempt < PUBLIC_RELEASES_RATE_LIMIT.limit;
        attempt += 1
      ) {
        statuses.add(
          (await apiRequest("/releases/app", { headers: flooding })).status
        )
      }

      expect(statuses).toEqual(new Set([200]))

      const limited = await apiRequest<ErrorBody>("/releases/app", {
        headers: flooding,
      })

      expect(limited.status).toBe(429)
      expect(limited.json.error.code).toBe("rate_limited")
      expect(Number(limited.raw.headers.get("retry-after"))).toBeGreaterThan(0)
      expect(limited.raw.headers.get("access-control-allow-origin")).toBe("*")

      const neighbour = await apiRequest("/releases/app", {
        headers: { [CLIENT_IP_HEADER]: "203.0.113.8" },
      })

      expect(neighbour.status).toBe(200)
    })

    it("keeps its budget to itself: the console stays reachable", async () => {
      const flooding = { [CLIENT_IP_HEADER]: "203.0.113.9" }

      for (
        let attempt = 0;
        attempt <= PUBLIC_RELEASES_RATE_LIMIT.limit;
        attempt += 1
      ) {
        await apiRequest("/releases/app", { headers: flooding })
      }

      const health = await apiRequest("/health", { headers: flooding })

      expect(health.status).toBe(200)
    })
  })
})
