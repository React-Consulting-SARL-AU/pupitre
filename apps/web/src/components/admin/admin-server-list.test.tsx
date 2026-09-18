import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import { createServer } from "@pupitre/api/testing/factories"
import { AdminServerList } from "@/components/admin/admin-server-list"
import { createConsoleUser, useSessionApiClient } from "@/testing/harness"
import {
  fill,
  render,
  trigger,
  waitUntil,
  withDashboard,
} from "@/testing/render"

const mounted: (() => void)[] = []

const SETTLE_MS = 5000

function list() {
  return withDashboard(<AdminServerList />, { platformRole: "owner" })
}

/** The row moves before the platform answers: the store is read once the call has landed, or the wait is over. */
async function storedServer(id: string, expected = "suspended") {
  const { prisma } = await bootApiTestServer()
  const deadline = Date.now() + SETTLE_MS
  let stored = await prisma.server.findUniqueOrThrow({ where: { id } })

  while (stored.status !== expected && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50))
    stored = await prisma.server.findUniqueOrThrow({ where: { id } })
  }

  return stored
}

describe("AdminServerList", () => {
  let organizationId: string

  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    const console = await createConsoleUser({
      email: "ops@test.local",
      role: "platform_admin",
    })

    await useSessionApiClient(console.token)

    organizationId = console.organization.id
  })

  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("lists every server with its organisation, and says when nothing matches", async () => {
    await createServer({ organizationId, name: "vps-one" })
    await createServer({ organizationId, name: "vps-two", status: "revoked" })

    const { container, unmount } = await render(list())

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("vps-two") === true)

    expect(container.textContent).toContain("vps-one")
    expect(container.textContent).toContain("1–2 of 2")
    expect(container.querySelectorAll("li")).toHaveLength(2)
    expect(container.textContent).toContain("Online")
    expect(container.textContent).toContain("Revoked")
    expect(
      [...container.querySelectorAll("button")].filter((button) =>
        (button.textContent ?? "").includes("Suspend")
      )
    ).toHaveLength(1)
  })

  it("suspends a running server with the reason the owners will read", async () => {
    const { server } = await createServer({ organizationId, name: "vps-one" })
    const { container, unmount, click } = await render(list())

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("vps-one") === true)
    await click(trigger(container, "Suspend"))

    const reason = document.querySelector(`#suspend-reason-${server.id}`)
    const confirm = document.querySelector(
      "[role=alertdialog] button[type=submit]"
    )

    if (!(reason && confirm)) {
      throw new Error("the suspension dialog did not open")
    }

    await fill(reason, "Abuse report")
    await click(confirm)
    await waitUntil(
      () => container.textContent?.includes("Suspended by the team") === true
    )

    expect(container.textContent).not.toContain("Online")

    const stored = await storedServer(server.id)

    expect(stored.status).toBe("suspended")
    expect(stored.suspendedReason).toBe("admin")
  })

  it("refuses an empty reason without calling the platform", async () => {
    const { server } = await createServer({ organizationId, name: "vps-one" })
    const { container, unmount, click } = await render(list())

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("vps-one") === true)
    await click(trigger(container, "Suspend"))

    const confirm = document.querySelector(
      "[role=alertdialog] button[type=submit]"
    )

    if (!confirm) {
      throw new Error("the suspension dialog did not open")
    }

    await click(confirm)
    await waitUntil(
      () => document.body.textContent?.includes("Give the reason") === true
    )

    expect((await storedServer(server.id, "active")).status).toBe("active")
  })

  it("leaves a reader of the platform the rows without the suspension", async () => {
    await createServer({ organizationId, name: "vps-one" })

    const { container, unmount } = await render(
      withDashboard(<AdminServerList />, { platformRole: "member" })
    )

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("vps-one") === true)

    expect(container.querySelectorAll("li")).toHaveLength(1)
    expect(container.textContent).not.toContain("Suspend")
  })
})
