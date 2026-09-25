import { describe, expect, it } from "bun:test"
import { bootApiTestServer } from "../../testing"
import { apiRequest } from "../../testing/request"
import { createSession, createUser } from "../../testing/session"

// CI runners are about twice as slow as a laptop; the budget catches regressions, not slow machines.
const BOOT_BUDGET_MS = process.env.CI ? 10_000 : 3000

describe("API test harness", () => {
  it("boots the API on SQLite within its budget and serves GET /me with a test session", async () => {
    const warm = await bootApiTestServer()

    await warm.stop()

    const started = performance.now()
    const server = await bootApiTestServer()
    const bootMs = Math.round(performance.now() - started)

    process.stdout.write(`\nAPI booted on SQLite in ${bootMs} ms\n`)

    expect(bootMs).toBeLessThan(BOOT_BUDGET_MS)

    const { user } = await createUser({ email: "ada@test.local" })
    const session = await createSession({ userId: user.id })
    const me = await apiRequest<{ user: { id: string } }>("/me", { session })

    expect(me.status).toBe(200)
    expect(me.json.user.id).toBe(user.id)
    expect(await server.prisma.user.count()).toBe(1)
  })
})
