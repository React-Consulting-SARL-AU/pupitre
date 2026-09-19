import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { joinPlatformOrganization } from "@pupitre/auth/testing"
import { type ApiTestServer, bootApiTestServer, resetDb } from "../../testing"
import {
  createOrganizationWithMembers,
  createServer,
} from "../../testing/factories"
import { apiRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

interface ErrorBody {
  error: { code: string; message: string; fix?: string }
}

let harness: ApiTestServer

async function platformMember() {
  const { user } = await createUser({ email: "lecture@pupitre.studio" })

  await joinPlatformOrganization(harness.prisma, user.id, "member")

  return await createSession({ userId: user.id })
}

async function platformAdmin() {
  const { user } = await createUser({
    email: "support@pupitre.studio",
    role: "platform_admin",
  })

  return await createSession({ userId: user.id })
}

async function aServerAndALink() {
  const { organization } = await createOrganizationWithMembers({
    name: "Atelier",
    roles: ["owner"],
  })
  const { server } = await createServer({ organizationId: organization.id })
  const link = await harness.prisma.affiliateLink.create({
    data: { code: "blog", name: "Blog", freeMonths: 1 },
  })

  return { organization, server, link }
}

describe("les pages de la plateforme", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("s'ouvrent en lecture à un membre de l'organisation Pupitre", async () => {
    const { organization, server, link } = await aServerAndALink()
    const reader = await platformMember()
    const paths = [
      "/admin/overview",
      "/admin/users",
      `/admin/users/${reader.session.userId}`,
      "/admin/organizations",
      `/admin/organizations/${organization.id}`,
      "/admin/servers",
      `/admin/servers/${server.id}`,
      "/admin/subscriptions",
      "/admin/events",
      "/admin/affiliate-links",
      `/admin/affiliate-links/${link.id}`,
      "/admin/releases",
      "/admin/team",
    ]

    for (const path of paths) {
      const response = await apiRequest(path, { session: reader })

      expect([path, response.status]).toEqual([path, 200])
    }
  })

  it("refusent d'agir à ce même membre, et disent le rôle qu'il faut", async () => {
    const { server, link } = await aServerAndALink()
    const { user: banned } = await createUser({ email: "client@test.local" })
    const reader = await platformMember()
    const actions: { path: string; method?: string; body?: unknown }[] = [
      { path: `/admin/servers/${server.id}/suspend`, body: { reason: "abus" } },
      { path: `/admin/servers/${server.id}/restore`, method: "POST" },
      { path: `/admin/users/${banned.id}/ban`, body: { reason: "abus" } },
      { path: `/admin/users/${banned.id}/unban`, method: "POST" },
      {
        path: "/admin/affiliate-links",
        body: { name: "Forum", free_months: 1 },
      },
      {
        path: `/admin/affiliate-links/${link.id}`,
        method: "PATCH",
        body: { disabled: true },
      },
      {
        path: "/admin/releases",
        body: {
          version: "1.0.0",
          arch: "amd64",
          sha256: "a".repeat(64),
          signature: `${"A".repeat(86)}==`,
          r2_key: "agent/1.0.0/pupitred-amd64",
        },
      },
      {
        path: "/admin/app-releases",
        body: {
          version: "1.0.0",
          os: "macos",
          arch: "arm64",
          format: "dmg",
          r2_key: "app/1.0.0/Pupitre-1.0.0-arm64.dmg",
          bytes: 1024,
          sha256: "a".repeat(64),
          signature: `${"A".repeat(86)}==`,
          notes: "Première version.",
        },
      },
    ]

    for (const action of actions) {
      const response = await apiRequest<ErrorBody>(action.path, {
        method: action.method,
        body: action.body,
        session: reader,
      })

      expect([action.path, response.status]).toEqual([action.path, 403])
      expect(response.json.error.code).toBe("forbidden")
      expect(response.json.error.message).toContain("Pupitre")
    }

    expect(await harness.prisma.affiliateLink.count()).toBe(1)
    expect(await harness.prisma.release.count()).toBe(0)
  })

  it("laissent agir un membre promu administrateur de l'organisation Pupitre", async () => {
    const { server } = await aServerAndALink()
    const reader = await platformMember()

    await joinPlatformOrganization(
      harness.prisma,
      reader.session.userId,
      "admin"
    )

    const response = await apiRequest(`/admin/servers/${server.id}/suspend`, {
      body: { reason: "balayage réseau" },
      session: reader,
    })

    expect(response.status).toBe(200)
  })

  it("restent fermées à un compte hors de l'organisation Pupitre", async () => {
    const { members } = await createOrganizationWithMembers({
      roles: ["owner"],
    })
    const anonymous = await apiRequest<ErrorBody>("/admin/organizations")
    const refused = await apiRequest<ErrorBody>("/admin/organizations", {
      session: members[0],
    })

    expect(anonymous.status).toBe(401)
    expect(refused.status).toBe(403)
    expect(refused.json.error.code).toBe("forbidden")
  })

  it("promeut un propriétaire de l'organisation Pupitre au rôle qui agit", async () => {
    const { server } = await aServerAndALink()
    const admin = await platformAdmin()
    const response = await apiRequest(`/admin/servers/${server.id}/suspend`, {
      body: { reason: "abus signalé" },
      session: admin,
    })

    expect(response.status).toBe(200)
  })
})
