import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { pollDeviceFlow, startDeviceFlow } from "@pupitre/auth/client/desktop"
import { ACCOUNT_DEACTIVATED_CODE } from "@pupitre/auth/lifecycle"
import {
  type ApiTestServer,
  bootApiTestServer,
  resetDb,
  TEST_BASE_URL,
} from "../../testing"
import { apiRequest, authRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

const URL_RE = /https?:\/\/\S+/

const DAY_MS = 86_400_000

interface ErrorBody {
  error: { code: string; message: string; fix?: string }
}

interface RefusalBody {
  code: string
  message: string
}

let harness: ApiTestServer

async function closeAccount(userId: string): Promise<void> {
  await harness.prisma.user.update({
    where: { id: userId },
    data: { deactivatedAt: new Date(), deactivatedReason: "fermeture" },
  })
}

async function magicLinkTokenFor(email: string): Promise<string> {
  const sent = harness.sentEmails.length
  const asked = await authRequest("POST", "/sign-in/magic-link", {
    email,
    callbackURL: "/dashboard",
  })

  expect(asked.status).toBe(200)

  const url = new URL(
    harness.sentEmails[sent].text.match(URL_RE)?.[0] ?? TEST_BASE_URL
  )

  return url.searchParams.get("token") ?? ""
}

describe("a closed account", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("no longer opens a session by magic link", async () => {
    const { user } = await createUser({ email: "ferme@test.local" })

    await closeAccount(user.id)

    const token = await magicLinkTokenFor("ferme@test.local")
    const verified = await authRequest<RefusalBody>(
      "GET",
      `/magic-link/verify?token=${token}&callbackURL=/dashboard`
    )

    expect(verified.status).toBe(403)
    expect(verified.json.code).toBe(ACCOUNT_DEACTIVATED_CODE)
    expect(verified.raw.headers.get("set-auth-token")).toBeNull()
    expect(
      await harness.prisma.session.count({ where: { userId: user.id } })
    ).toBe(0)
  })

  it("refuses a magic link issued before the closure", async () => {
    const { user } = await createUser({ email: "lien-avant@test.local" })
    const token = await magicLinkTokenFor("lien-avant@test.local")

    await closeAccount(user.id)

    const verified = await authRequest<RefusalBody>(
      "GET",
      `/magic-link/verify?token=${token}&callbackURL=/dashboard`
    )

    expect(verified.status).toBe(403)
    expect(verified.json.code).toBe(ACCOUNT_DEACTIVATED_CODE)
    expect(
      await harness.prisma.session.count({ where: { userId: user.id } })
    ).toBe(0)
  })

  it("no longer opens a session through the device flow, and returns the code the app reads", async () => {
    const { user } = await createUser({ email: "ferme-desktop@test.local" })
    const { headers } = await createSession({ userId: user.id })
    const started = await startDeviceFlow(TEST_BASE_URL, {
      fetch: harness.fetch,
    })

    await authRequest(
      "GET",
      `/device?user_code=${started.user_code}`,
      undefined,
      headers
    )
    await authRequest(
      "POST",
      "/device/approve",
      { userCode: started.user_code },
      headers
    )
    await closeAccount(user.id)
    await harness.prisma.deviceCode.updateMany({
      data: { lastPolledAt: new Date(Date.now() - 60_000) },
    })

    await expect(
      pollDeviceFlow(TEST_BASE_URL, started.device_code, {
        fetch: harness.fetch,
      })
    ).rejects.toMatchObject({ code: ACCOUNT_DEACTIVATED_CODE })
    expect(
      await harness.prisma.session.count({ where: { userId: user.id } })
    ).toBe(1)
  })

  it("sees its already open session refused, with the fix", async () => {
    const { user } = await createUser({ email: "encore-ouvert@test.local" })
    const session = await createSession({ userId: user.id })

    await closeAccount(user.id)

    const refused = await apiRequest<ErrorBody>("/me", {
      locale: "fr",
      session,
    })

    expect(refused.status).toBe(403)
    expect(refused.json.error.code).toBe("forbidden")
    expect(refused.json.error.message).toBe("Ce compte est fermé.")
    expect(refused.json.error.fix).toContain("support@pupitre.studio")
  })
})

describe("a suspended account", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("reads the end of its suspension, not a closure", async () => {
    const { user } = await createUser({ email: "suspendu@test.local" })
    const session = await createSession({ userId: user.id })

    await harness.prisma.user.update({
      where: { id: user.id },
      data: {
        banned: true,
        banReason: "signalement 4412",
        banExpires: new Date("2036-10-01T12:00:00.000Z"),
      },
    })

    const refused = await apiRequest<ErrorBody>("/me", {
      locale: "fr",
      session,
    })

    expect(refused.status).toBe(403)
    expect(refused.json.error.code).toBe("forbidden")
    expect(refused.json.error.message).toBe(
      "Ce compte est suspendu jusqu'au 1 octobre 2036."
    )
    expect(refused.json.error.fix).toContain("support@pupitre.studio")
  })

  it("reads a closure when the suspension has no end", async () => {
    const { user } = await createUser({ email: "suspendu-sans-fin@test.local" })
    const session = await createSession({ userId: user.id })

    await harness.prisma.user.update({
      where: { id: user.id },
      data: { banned: true, banReason: "signalement 4412" },
    })

    const refused = await apiRequest<ErrorBody>("/me", {
      locale: "fr",
      session,
    })

    expect(refused.status).toBe(403)
    expect(refused.json.error.message).toBe("Ce compte est fermé.")
  })

  it("opens again once the end date has passed", async () => {
    const { user } = await createUser({ email: "suspension-finie@test.local" })
    const session = await createSession({ userId: user.id })

    await harness.prisma.user.update({
      where: { id: user.id },
      data: {
        banned: true,
        banReason: "signalement 4412",
        banExpires: new Date(Date.now() - DAY_MS),
      },
    })

    expect((await apiRequest("/me", { session })).status).toBe(200)
  })
})
