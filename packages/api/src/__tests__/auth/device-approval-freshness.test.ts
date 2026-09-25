import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { startDeviceFlow } from "@pupitre/auth/client/desktop"
import { bootApiTestServer, resetDb, TEST_BASE_URL } from "../../testing"
import { authRequest, CookieJar } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

const MINUTE_MS = 60_000

const URL_RE = /https?:\/\/\S+/

async function claimedBy(ageMs: number) {
  const server = await bootApiTestServer()
  const started = await startDeviceFlow(TEST_BASE_URL, { fetch: server.fetch })
  const { user } = await createUser({ email: "ada@test.local" })
  const created = await createSession({ userId: user.id })

  await server.prisma.session.update({
    where: { id: created.session.id },
    data: { createdAt: new Date(Date.now() - ageMs) },
  })
  await authRequest(
    "GET",
    `/device?user_code=${started.user_code}`,
    undefined,
    created.headers
  )

  return { userCode: started.user_code, headers: created.headers }
}

describe("confirming a device code", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("asks a browser signed in too long ago to sign in again, and leaves the code pending", async () => {
    const { prisma } = await bootApiTestServer()
    const { userCode, headers } = await claimedBy(11 * MINUTE_MS)
    const refused = await authRequest<{ code: string }>(
      "POST",
      "/device/approve",
      { userCode },
      headers
    )

    expect(refused.status).toBe(403)
    expect(refused.json.code).toBe("SESSION_NOT_FRESH")

    const code = await prisma.deviceCode.findFirstOrThrow()

    expect(code.status).toBe("pending")
  })

  it("reads the age of a browser's cookie session the same way", async () => {
    const server = await bootApiTestServer()
    const started = await startDeviceFlow(TEST_BASE_URL, {
      fetch: server.fetch,
    })
    const sendCount = server.sentEmails.length

    await authRequest("POST", "/sign-in/magic-link", {
      email: "grace@test.local",
      callbackURL: "/dashboard",
    })

    const link = new URL(
      server.sentEmails[sendCount]?.text.match(URL_RE)?.[0] ?? ""
    )
    const verified = await authRequest(
      "GET",
      `/magic-link/verify?token=${link.searchParams.get("token")}&callbackURL=/dashboard`
    )
    const cookie = { cookie: new CookieJar().absorb(verified.raw).header }

    await server.prisma.session.updateMany({
      data: { createdAt: new Date(Date.now() - 11 * MINUTE_MS) },
    })
    await authRequest(
      "GET",
      `/device?user_code=${started.user_code}`,
      undefined,
      cookie
    )

    const refused = await authRequest<{ code: string }>(
      "POST",
      "/device/approve",
      { userCode: started.user_code },
      cookie
    )

    expect(refused.status).toBe(403)
    expect(refused.json.code).toBe("SESSION_NOT_FRESH")
  })

  it("confirms from a sign-in a few minutes old", async () => {
    const { userCode, headers } = await claimedBy(5 * MINUTE_MS)
    const approved = await authRequest<{ success: boolean }>(
      "POST",
      "/device/approve",
      { userCode },
      headers
    )

    expect(approved.status).toBe(200)
    expect(approved.json.success).toBe(true)
  })
})
