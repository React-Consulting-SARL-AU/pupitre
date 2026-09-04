import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import {
  fetchWithBearer,
  pollDeviceFlow,
  startDeviceFlow,
} from "@pupitre/auth/client/desktop"
import { bootApiTestServer, resetDb, TEST_BASE_URL } from "../../testing"
import { authRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

const USER_CODE_RE = /^[A-Z0-9-]+$/

async function rewindLastPoll(): Promise<void> {
  const { prisma } = await bootApiTestServer()

  await prisma.deviceCode.updateMany({
    data: { lastPolledAt: new Date(Date.now() - 60_000) },
  })
}

describe("device flow", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("issues a code, gets approved by a signed-in user and yields a bearer that resolves the session", async () => {
    const server = await bootApiTestServer()
    const fetchOptions = { fetch: server.fetch }

    const started = await startDeviceFlow(TEST_BASE_URL, fetchOptions)

    expect(started.device_code).toBeTruthy()
    expect(started.user_code).toMatch(USER_CODE_RE)
    expect(started.verification_uri).toBe(`${TEST_BASE_URL}/auth/device`)
    expect(started.verification_uri_complete).toContain(started.user_code)
    expect(started.interval).toBe(5)
    expect(started.expires_in).toBe(30 * 60)

    const pending = await pollDeviceFlow(
      TEST_BASE_URL,
      started.device_code,
      fetchOptions
    )

    expect(pending).toEqual({ status: "authorization_pending" })

    const tooFast = await pollDeviceFlow(
      TEST_BASE_URL,
      started.device_code,
      fetchOptions
    )

    expect(tooFast).toEqual({ status: "slow_down" })

    const { user, organization } = await createUser({
      email: "ada@test.local",
    })
    const { headers } = await createSession({ userId: user.id })

    const claimed = await authRequest<{ status: string }>(
      "GET",
      `/device?user_code=${started.user_code}`,
      undefined,
      headers
    )

    expect(claimed.status).toBe(200)
    expect(claimed.json.status).toBe("pending")

    const approved = await authRequest<{ success: boolean }>(
      "POST",
      "/device/approve",
      { userCode: started.user_code },
      headers
    )

    expect(approved.status).toBe(200)
    expect(approved.json.success).toBe(true)

    await rewindLastPoll()

    const granted = await pollDeviceFlow(
      TEST_BASE_URL,
      started.device_code,
      fetchOptions
    )

    expect(granted.status).toBe("authorized")

    if (granted.status !== "authorized") {
      throw new Error("unreachable")
    }

    const session = await authRequest<{
      session: { activeOrganizationId: string | null }
      user: { id: string }
    }>("GET", "/get-session", undefined, {
      authorization: `Bearer ${granted.token}`,
    })

    expect(session.status).toBe(200)
    expect(session.json.user.id).toBe(user.id)
    expect(session.json.session.activeOrganizationId).toBe(organization.id)

    const viaHelper = await fetchWithBearer(
      granted.token,
      server.fetch
    )(`${TEST_BASE_URL}/api/auth/get-session`)

    expect(viaHelper.status).toBe(200)
    expect(((await viaHelper.json()) as { user: { id: string } }).user.id).toBe(
      user.id
    )

    expect(await server.prisma.deviceCode.count()).toBe(0)
  })

  it("refuses approval without a session and from another user", async () => {
    const server = await bootApiTestServer()
    const started = await startDeviceFlow(TEST_BASE_URL, {
      fetch: server.fetch,
    })

    const anonymous = await authRequest("POST", "/device/approve", {
      userCode: started.user_code,
    })

    expect(anonymous.status).toBe(401)

    const owner = await createUser({ email: "owner@test.local" })
    const ownerSession = await createSession({ userId: owner.user.id })

    await authRequest(
      "GET",
      `/device?user_code=${started.user_code}`,
      undefined,
      ownerSession.headers
    )

    const intruder = await createUser({ email: "intruder@test.local" })
    const intruderSession = await createSession({ userId: intruder.user.id })

    const denied = await authRequest(
      "POST",
      "/device/approve",
      { userCode: started.user_code },
      intruderSession.headers
    )

    expect(denied.status).toBe(403)
  })

  it("reports an expired code to the desktop client", async () => {
    const server = await bootApiTestServer()
    const started = await startDeviceFlow(TEST_BASE_URL, {
      fetch: server.fetch,
    })

    await server.prisma.deviceCode.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    const expired = await pollDeviceFlow(TEST_BASE_URL, started.device_code, {
      fetch: server.fetch,
    })

    expect(expired).toEqual({ status: "expired" })
  })
})
