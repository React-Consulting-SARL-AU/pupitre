import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { joinPlatformOrganization } from "@pupitre/auth/testing"
import { DATA_CONSENT_VERSION } from "@pupitre/shared/legal"
import { bootApiTestServer, resetDb } from "../../testing"
import { createServer } from "../../testing/factories"
import { apiRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

interface ConsentBody {
  data_consent: { version: string; accepted_at: string } | null
}

interface ErrorBody {
  error: { code: string; message: string; fix?: string }
}

async function accountWithoutConsent() {
  const { user, organization } = await createUser({ dataConsent: false })
  const session = await createSession({ userId: user.id })

  return { user, organization, session }
}

describe("the data consent", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("is null in /me until the account agrees", async () => {
    const { session } = await accountWithoutConsent()

    const response = await apiRequest<ConsentBody>("/me", { session })

    expect(response.status).toBe(200)
    expect(response.json.data_consent).toBeNull()
  })

  it("is asked again once the text has changed", async () => {
    const { prisma } = await bootApiTestServer()
    const { user, session } = await accountWithoutConsent()

    await prisma.user.update({
      where: { id: user.id },
      data: { dataConsentVersion: "2020-01-01", dataConsentAt: new Date() },
    })

    const me = await apiRequest<ConsentBody>("/me", { session })
    const servers = await apiRequest<ErrorBody>("/servers", { session })

    expect(me.json.data_consent).toBeNull()
    expect(servers.status).toBe(403)
    expect(servers.json.error.code).toBe("consent_required")
  })

  it("records the current version, its date and a journal entry", async () => {
    const { prisma } = await bootApiTestServer()
    const { user, session } = await accountWithoutConsent()

    const response = await apiRequest<{
      data: { version: string; accepted_at: string }
    }>("/me/consent", { body: { version: DATA_CONSENT_VERSION }, session })
    const me = await apiRequest<ConsentBody>("/me", { session })
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    })
    const event = await prisma.event.findFirst({
      where: { action: "user.data_consented", targetId: user.id },
    })

    expect(response.status).toBe(200)
    expect(response.json.data.version).toBe(DATA_CONSENT_VERSION)
    expect(Date.parse(response.json.data.accepted_at)).not.toBeNaN()
    expect(me.json.data_consent).toEqual(response.json.data)
    expect(stored.dataConsentVersion).toBe(DATA_CONSENT_VERSION)
    expect(stored.dataConsentAt).toBeInstanceOf(Date)
    expect(event?.actorUserId).toBe(user.id)
    expect(event?.targetType).toBe("user")
    expect(event?.payload).toEqual({ version: DATA_CONSENT_VERSION })
  })

  it("refuses a version other than the current one", async () => {
    const { prisma } = await bootApiTestServer()
    const { user, session } = await accountWithoutConsent()

    const response = await apiRequest<ErrorBody>("/me/consent", {
      body: { version: "2020-01-01" },
      session,
      locale: "en",
    })
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    })

    expect(response.status).toBe(409)
    expect(response.json.error.code).toBe("conflict")
    expect(response.json.error.fix).toContain("Reload")
    expect(stored.dataConsentVersion).toBeNull()
  })

  it("refuses to record a consent without a session", async () => {
    const response = await apiRequest("/me/consent", {
      body: { version: DATA_CONSENT_VERSION },
    })

    expect(response.status).toBe(401)
  })

  it("lets the language change before the consent", async () => {
    const { session } = await accountWithoutConsent()

    const response = await apiRequest<{ user: { locale: string } }>("/me", {
      method: "PATCH",
      body: { locale: "en" },
      session,
    })

    expect(response.status).toBe(200)
    expect(response.json.user.locale).toBe("en")
  })
})

describe("POST /me/consent/decline", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("erases on the spot an account that holds only its sign-up", async () => {
    const { prisma } = await bootApiTestServer()
    const { user, organization, session } = await accountWithoutConsent()

    const response = await apiRequest("/me/consent/decline", {
      method: "POST",
      session,
    })
    const after = await apiRequest("/me", { session })

    expect(response.status).toBe(204)
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull()
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0)
    expect(
      await prisma.organization.findUnique({ where: { id: organization.id } })
    ).toBeNull()
    expect(after.status).toBe(401)
  })

  it("sends an account that already agreed to the account deletion", async () => {
    const { prisma } = await bootApiTestServer()
    const { user, session } = await accountWithoutConsent()

    await prisma.user.update({
      where: { id: user.id },
      data: { dataConsentVersion: "2020-01-01", dataConsentAt: new Date() },
    })

    const response = await apiRequest<ErrorBody>("/me/consent/decline", {
      method: "POST",
      session,
      locale: "en",
    })

    expect(response.status).toBe(409)
    expect(response.json.error.code).toBe("conflict")
    expect(response.json.error.fix).toContain(
      "http://localhost:3000/dashboard/settings"
    )
    expect(
      await prisma.user.findUnique({ where: { id: user.id } })
    ).not.toBeNull()
  })

  it("keeps an account whose organization holds a server", async () => {
    const { prisma } = await bootApiTestServer()
    const { user, organization, session } = await accountWithoutConsent()

    await createServer({ organizationId: organization.id })

    const response = await apiRequest("/me/consent/decline", {
      method: "POST",
      session,
    })

    expect(response.status).toBe(409)
    expect(
      await prisma.user.findUnique({ where: { id: user.id } })
    ).not.toBeNull()
  })

  it("keeps an account that registered a device", async () => {
    const { prisma } = await bootApiTestServer()
    const { user, session } = await accountWithoutConsent()

    await prisma.device.create({
      data: {
        userId: user.id,
        name: "MacBook",
        publicKey: "ssh-ed25519 AAAA",
        fingerprint: "SHA256:test",
      },
    })

    const response = await apiRequest("/me/consent/decline", {
      method: "POST",
      session,
    })

    expect(response.status).toBe(409)
  })

  it("keeps an account whose organization has another member", async () => {
    const { prisma } = await bootApiTestServer()
    const { organization, session } = await accountWithoutConsent()
    const { user: other } = await createUser()

    await prisma.member.create({
      data: {
        id: crypto.randomUUID(),
        organizationId: organization.id,
        userId: other.id,
        role: "member",
        createdAt: new Date(),
      },
    })

    const response = await apiRequest("/me/consent/decline", {
      method: "POST",
      session,
    })

    expect(response.status).toBe(409)
  })

  it("refuses without a session", async () => {
    const response = await apiRequest("/me/consent/decline", {
      method: "POST",
    })

    expect(response.status).toBe(401)
  })
})

describe("the consent guard", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("refuses every account route until the consent, with the console page as fix", async () => {
    const { organization, session } = await accountWithoutConsent()

    for (const path of [
      "/me/servers",
      "/me/devices",
      "/me/key-approvals",
      "/servers",
      "/backups",
      `/orgs/${organization.id}/members`,
      "/releases/agent/latest",
    ]) {
      const response = await apiRequest<ErrorBody>(path, {
        session,
        locale: "en",
      })

      expect(response.status, path).toBe(403)
      expect(response.json.error.code, path).toBe("consent_required")
      expect(response.json.error.fix, path).toContain(
        "http://localhost:3000/auth/consent"
      )
    }
  })

  it("speaks the request's language", async () => {
    const { session } = await accountWithoutConsent()

    const french = await apiRequest<ErrorBody>("/servers", {
      session,
      locale: "fr",
    })
    const english = await apiRequest<ErrorBody>("/servers", {
      session,
      locale: "en",
    })

    expect(french.json.error.message).toContain("Cloudflare")
    expect(french.json.error.fix).toContain("Ouvrez")
    expect(english.json.error.message).toContain("United States")
    expect(english.json.error.fix).toContain("Open")
  })

  it("refuses a write as well as a read", async () => {
    const { session } = await accountWithoutConsent()

    const response = await apiRequest<ErrorBody>("/me/devices", {
      body: { name: "MacBook", public_key: "ssh-ed25519 AAAA laptop" },
      session,
    })

    expect(response.status).toBe(403)
    expect(response.json.error.code).toBe("consent_required")
  })

  it("closes the platform pages to a team member who has not agreed", async () => {
    const { prisma } = await bootApiTestServer()
    const { user, session } = await accountWithoutConsent()

    await joinPlatformOrganization(prisma, user.id, "owner")

    const response = await apiRequest<ErrorBody>("/admin/overview", {
      session,
    })

    expect(response.status).toBe(403)
    expect(response.json.error.code).toBe("consent_required")
  })

  it("opens the routes once the consent is given", async () => {
    const { session } = await accountWithoutConsent()

    await apiRequest("/me/consent", {
      body: { version: DATA_CONSENT_VERSION },
      session,
    })

    const servers = await apiRequest("/servers", { session })
    const mine = await apiRequest("/me/servers", { session })

    expect(servers.status).toBe(200)
    expect(mine.status).toBe(200)
  })

  it("still answers 401 rather than consent_required without a session", async () => {
    const response = await apiRequest<ErrorBody>("/servers")

    expect(response.status).toBe(401)
    expect(response.json.error.code).toBe("unauthenticated")
  })

  it("leaves the public routes open", async () => {
    const { session } = await accountWithoutConsent()

    const status = await apiRequest("/status", { session })
    const health = await apiRequest("/health", { session })

    expect(status.status).toBe(200)
    expect(health.status).toBe(200)
  })

  it("leaves the agent alone: a server is not a person", async () => {
    const { organization } = await accountWithoutConsent()
    const { token } = await createServer({
      organizationId: organization.id,
      status: "active",
    })

    const response = await apiRequest("/agent/state", { bearer: token })

    expect(response.status).toBe(200)
  })
})
