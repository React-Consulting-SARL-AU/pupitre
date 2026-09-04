import { beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { bootApiTestServer, resetDb, TEST_BASE_URL } from "@pupitre/api/testing"
import { pollDeviceFlow, startDeviceFlow } from "@pupitre/auth/client/desktop"
import {
  approveDeviceCode,
  denyDeviceCode,
  formatUserCode,
  lookupDeviceCode,
  normalizeUserCode,
} from "@/lib/auth/device-flow"
import { apiJson, createConsoleUser, withHeaders } from "@/testing/harness"

async function rewindLastPoll(): Promise<void> {
  const { prisma } = await bootApiTestServer()

  await prisma.deviceCode.updateMany({
    data: { lastPolledAt: new Date(Date.now() - 60_000) },
  })
}

describe("code formatting", () => {
  it("keeps only the significant characters and groups them by four", () => {
    expect(normalizeUserCode(" abcd-efgh ")).toBe("ABCDEFGH")
    expect(formatUserCode("abcdefgh")).toBe("ABCD-EFGH")
    expect(formatUserCode("abc")).toBe("ABC")
  })
})

describe("the console page of the device flow", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("looks a code up, confirms it and hands the app a bearer session", async () => {
    const server = await bootApiTestServer()
    const started = await startDeviceFlow(TEST_BASE_URL, {
      fetch: server.fetch,
    })

    const { user, headers } = await createConsoleUser({
      email: "ada@test.local",
    })
    const asUser = withHeaders(server, headers)

    const lookup = await lookupDeviceCode(
      TEST_BASE_URL,
      formatUserCode(started.user_code),
      { fetch: asUser }
    )

    expect(lookup.status).toBe("pending")

    await approveDeviceCode(TEST_BASE_URL, started.user_code, { fetch: asUser })
    await rewindLastPoll()

    const granted = await pollDeviceFlow(TEST_BASE_URL, started.device_code, {
      fetch: server.fetch,
    })

    expect(granted.status).toBe("authorized")

    if (granted.status !== "authorized") {
      throw new Error("unreachable")
    }

    const me = await apiJson<{ user: { id: string } }>("/me", {
      bearer: granted.token,
    })

    expect(me.status).toBe(200)
    expect(me.json.user.id).toBe(user.id)
  })

  it("refuses to confirm a code without a session, with a remedy", async () => {
    const server = await bootApiTestServer()
    const started = await startDeviceFlow(TEST_BASE_URL, {
      fetch: server.fetch,
    })

    expect(
      approveDeviceCode(TEST_BASE_URL, started.user_code, {
        fetch: server.fetch,
      })
    ).rejects.toMatchObject({ code: "unauthenticated" })
  })

  it("denies a code so the app never gets a session", async () => {
    const server = await bootApiTestServer()
    const started = await startDeviceFlow(TEST_BASE_URL, {
      fetch: server.fetch,
    })
    const { headers } = await createConsoleUser({ email: "grace@test.local" })
    const asUser = withHeaders(server, headers)

    await lookupDeviceCode(TEST_BASE_URL, started.user_code, { fetch: asUser })
    await denyDeviceCode(TEST_BASE_URL, started.user_code, { fetch: asUser })
    await rewindLastPoll()

    const polled = await pollDeviceFlow(TEST_BASE_URL, started.device_code, {
      fetch: server.fetch,
    })

    expect(polled.status).toBe("denied")
  })
})
