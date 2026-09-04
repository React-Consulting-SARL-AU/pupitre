import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { CLIENT_IP_HEADER } from "@pupitre/auth/server"
import { bootApiTestServer, resetDb, TEST_BASE_URL } from "../../testing"
import { authRequest, sessionTokenFrom } from "../../testing/request"

const URL_RE = /https?:\/\/\S+/

function magicLinkUrlFrom(text: string): string {
  const match = text.match(URL_RE)

  if (!match) {
    throw new Error("no magic link in the email body")
  }

  return match[0]
}

async function signUpByMagicLink(email: string): Promise<string> {
  const { sentEmails } = await bootApiTestServer()
  const sendCount = sentEmails.length

  const requested = await authRequest("POST", "/sign-in/magic-link", {
    email,
    callbackURL: "/dashboard",
  })

  expect(requested.status).toBe(200)
  expect(sentEmails).toHaveLength(sendCount + 1)

  const url = new URL(magicLinkUrlFrom(sentEmails[sendCount].text))
  const token = url.searchParams.get("token")

  expect(url.origin).toBe(TEST_BASE_URL)
  expect(token).toBeTruthy()

  const verified = await authRequest(
    "GET",
    `/magic-link/verify?token=${token}&callbackURL=/dashboard`
  )

  expect(verified.status).toBe(302)
  expect(verified.raw.headers.get("location")).toBe(
    `${TEST_BASE_URL}/dashboard`
  )

  const sessionToken = sessionTokenFrom(verified.raw)

  if (!sessionToken) {
    throw new Error("no session token after verification")
  }

  return sessionToken
}

describe("magic link sign-up", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("creates the user, a personal organization owned by them, active in the session", async () => {
    const { prisma } = await bootApiTestServer()
    const sessionToken = await signUpByMagicLink("ada.lovelace@test.local")

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "ada.lovelace@test.local" },
      include: { members: { include: { organization: true } } },
    })

    expect(user.emailVerified).toBe(true)
    expect(user.members).toHaveLength(1)
    expect(user.members[0].role).toBe("owner")
    expect(user.members[0].organization.name).toBe("ada.lovelace")
    expect(user.members[0].organization.slug).toBe("ada-lovelace")

    const session = await authRequest<{
      session: { activeOrganizationId: string | null; userId: string }
      user: { id: string; email: string }
    }>("GET", "/get-session", undefined, {
      authorization: `Bearer ${sessionToken}`,
    })

    expect(session.status).toBe(200)
    expect(session.json.user.id).toBe(user.id)
    expect(session.json.session.activeOrganizationId).toBe(
      user.members[0].organizationId
    )
  })

  it("keeps personal organization slugs unique", async () => {
    const { prisma } = await bootApiTestServer()

    await signUpByMagicLink("ada@one.test")
    await signUpByMagicLink("ada@two.test")

    const slugs = await prisma.organization.findMany({
      orderBy: { slug: "asc" },
      select: { slug: true },
    })

    expect(slugs.map((row) => row.slug)).toEqual(["ada", "ada-2"])
  })

  it("signs an existing user in without creating a second organization", async () => {
    const { prisma } = await bootApiTestServer()

    await signUpByMagicLink("ada@test.local")
    await signUpByMagicLink("ada@test.local")

    expect(await prisma.user.count()).toBe(1)
    expect(await prisma.organization.count()).toBe(1)
    expect(await prisma.session.count()).toBe(2)
  })

  it("rate limits verification attempts per client IP", async () => {
    const headers = { [CLIENT_IP_HEADER]: "203.0.113.7" }
    const statuses: number[] = []

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const verified = await authRequest(
        "GET",
        "/magic-link/verify?token=forged&callbackURL=/dashboard",
        undefined,
        headers
      )

      statuses.push(verified.status)
    }

    expect(statuses).toEqual([302, 302, 302, 302, 302, 429])

    const otherClient = await authRequest(
      "GET",
      "/magic-link/verify?token=forged&callbackURL=/dashboard",
      undefined,
      { [CLIENT_IP_HEADER]: "203.0.113.8" }
    )

    expect(otherClient.status).toBe(302)
  })

  it("refuses a forged token", async () => {
    const verified = await authRequest(
      "GET",
      "/magic-link/verify?token=forged&callbackURL=/dashboard"
    )

    expect(verified.status).toBe(302)
    expect(verified.raw.headers.get("location")).toContain("error=")
    expect(sessionTokenFrom(verified.raw)).toBeNull()
  })
})
