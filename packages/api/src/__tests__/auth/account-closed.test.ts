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

interface ErrorBody {
  error: { code: string; message: string; fix?: string }
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

describe("un compte fermé", () => {
  beforeAll(async () => {
    harness = await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("n'ouvre plus de session par lien magique", async () => {
    const { user } = await createUser({ email: "ferme@test.local" })

    await closeAccount(user.id)

    const token = await magicLinkTokenFor("ferme@test.local")
    const verified = await authRequest(
      "GET",
      `/magic-link/verify?token=${token}&callbackURL=/dashboard`
    )

    expect(verified.raw.headers.get("set-auth-token")).toBeNull()
    expect(
      await harness.prisma.session.count({ where: { userId: user.id } })
    ).toBe(0)
  })

  it("n'ouvre plus de session par le device flow", async () => {
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

    expect(
      pollDeviceFlow(TEST_BASE_URL, started.device_code, {
        fetch: harness.fetch,
      })
    ).rejects.toThrow()
    expect(
      await harness.prisma.session.count({ where: { userId: user.id } })
    ).toBe(1)
  })

  it("voit sa session déjà ouverte refusée, avec le remède", async () => {
    const { user } = await createUser({ email: "encore-ouvert@test.local" })
    const session = await createSession({ userId: user.id })

    await closeAccount(user.id)

    const refused = await apiRequest<ErrorBody>("/me", { session })

    expect(refused.status).toBe(403)
    expect(refused.json.error.code).toBe("forbidden")
    expect(refused.json.error.fix).toContain("support@pupitre.studio")
  })

  it("porte un code stable que l'app peut lire", () => {
    expect(ACCOUNT_DEACTIVATED_CODE).toBe("ACCOUNT_DEACTIVATED")
  })
})
