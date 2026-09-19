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
import type { OrgRole } from "@pupitre/shared/permissions"
import {
  AdminServerList,
  type AdminServerListSearch,
} from "@/components/admin/admin-server-list"
import { createConsoleUser, useSessionApiClient } from "@/testing/harness"
import { ListSearchHarness } from "@/testing/list-search"
import {
  fill,
  press,
  render,
  trigger,
  waitUntil,
  withDashboard,
} from "@/testing/render"

const mounted: (() => void)[] = []

const SETTLE_MS = 5000

const DAY_MS = 86_400_000

function list(
  platformRole: OrgRole = "owner",
  initial?: AdminServerListSearch
) {
  return withDashboard(
    <ListSearchHarness<AdminServerListSearch> initial={initial}>
      {(handle) => <AdminServerList {...handle} />}
    </ListSearchHarness>,
    { platformRole }
  )
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

function menuItem(label: string): HTMLElement {
  const found = [...document.querySelectorAll("[role=menuitem]")].find(
    (item) => (item.textContent ?? "").trim() === label
  )

  if (!found) {
    throw new Error(
      `no menu item labelled ${label} in ${document.body.innerHTML}`
    )
  }

  return found as HTMLElement
}

function reasonField(serverId: string): Element {
  const found = document.querySelector(`#suspend-${serverId}-reason`)

  if (!found) {
    throw new Error("the suspension dialog did not open")
  }

  return found
}

function confirmButton(): Element {
  const found = document.querySelector("[role=dialog] button[type=submit]")

  if (!found) {
    throw new Error("the suspension dialog did not open")
  }

  return found
}

async function openSuspension(
  click: (element: Element) => Promise<void>,
  container: HTMLElement,
  name: string
) {
  await click(trigger(container, `Actions on ${name}`))
  await waitUntil(() => document.querySelector("[role=menuitem]") !== null)
  await click(menuItem("Suspend"))
  await waitUntil(
    () => document.querySelector("[role=dialog] button[type=submit]") !== null
  )
}

describe("AdminServerList", () => {
  let organizationId: string
  let token: string

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
    token = console.token
  })

  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("lists every server with its organisation, its channel and its seat", async () => {
    await createServer({ organizationId, name: "vps-one" })
    await createServer({ organizationId, name: "vps-two", status: "revoked" })

    const { container, unmount } = await render(list())

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("vps-two") === true)

    expect(container.textContent).toContain("vps-one")
    expect(container.textContent).toContain("1–2 of 2")
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2)
    expect(container.textContent).toContain("Online")
    expect(container.textContent).toContain("Revoked")
    expect(container.textContent).toContain("Stable")
    expect(container.textContent).toContain("Taken")
    expect(container.textContent).toContain("Free")
  })

  it("suspends a running server from its row, with the reason the owners will read", async () => {
    const { server } = await createServer({ organizationId, name: "vps-one" })
    const { container, unmount, click } = await render(list())

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("vps-one") === true)
    await openSuspension(click, container, "vps-one")
    await fill(reasonField(server.id), "Abuse report")
    await click(confirmButton())
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
    await openSuspension(click, container, "vps-one")
    await click(confirmButton())
    await waitUntil(
      () => document.body.textContent?.includes("Give the reason") === true
    )

    expect((await storedServer(server.id, "active")).status).toBe("active")
  })

  it("keeps the suspension dialog open on a network cut, with the refusal and the typing", async () => {
    const { server } = await createServer({ organizationId, name: "vps-one" })

    await useSessionApiClient(token, { cut: (url) => url.includes("/suspend") })

    const { container, unmount, click } = await render(list())

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("vps-one") === true)
    await openSuspension(click, container, "vps-one")
    await fill(reasonField(server.id), "Abuse report")
    await click(confirmButton())
    await waitUntil(
      () =>
        document.body.textContent?.includes("The suspension failed.") === true
    )

    expect(document.querySelector("[role=dialog]")).not.toBeNull()
    expect((reasonField(server.id) as HTMLInputElement).value).toBe(
      "Abuse report"
    )
    expect((await storedServer(server.id, "active")).status).toBe("active")
  })

  it("carries no refusal from one server to the next", async () => {
    const one = await createServer({ organizationId, name: "vps-one" })

    await createServer({ organizationId, name: "vps-two" })
    await useSessionApiClient(token, { cut: (url) => url.includes("/suspend") })

    const { container, unmount, click } = await render(list())

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("vps-two") === true)
    await openSuspension(click, container, "vps-one")
    await fill(reasonField(one.server.id), "Abuse report")
    await click(confirmButton())
    await waitUntil(
      () =>
        document.body.textContent?.includes("The suspension failed.") === true
    )
    await press(document.body, "Escape")
    await waitUntil(() => document.querySelector("[role=dialog]") === null)
    await openSuspension(click, container, "vps-two")

    expect(document.body.textContent).not.toContain("The suspension failed.")
  })

  it("moves a server to the beta channel from its row", async () => {
    const { server } = await createServer({ organizationId, name: "vps-one" })
    const { prisma } = await bootApiTestServer()
    const { container, unmount, click } = await render(list())

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("vps-one") === true)
    await click(trigger(container, "Actions on vps-one"))
    await waitUntil(() => document.querySelector("[role=menuitem]") !== null)
    await click(menuItem("Move to beta"))
    await waitUntil(() => container.textContent?.includes("Beta") === true)

    expect(
      (await prisma.server.findUniqueOrThrow({ where: { id: server.id } }))
        .channel
    ).toBe("beta")
  })

  it("keeps only the servers the freshness filter asks for", async () => {
    const { prisma } = await bootApiTestServer()
    const { server } = await createServer({ organizationId, name: "vps-one" })
    const quiet = await createServer({ organizationId, name: "vps-quiet" })

    await prisma.server.update({
      where: { id: server.id },
      data: { lastHeartbeatAt: new Date() },
    })
    await prisma.server.update({
      where: { id: quiet.server.id },
      data: { createdAt: new Date(Date.now() - 3 * DAY_MS) },
    })

    const { container, unmount } = await render(list("owner", { stale: true }))

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("vps-quiet") === true)

    expect(container.textContent).not.toContain("vps-one")
  })

  it("leaves a reader of the platform the rows without any gesture", async () => {
    await createServer({ organizationId, name: "vps-one" })

    const { container, unmount } = await render(list("member"))

    mounted.push(unmount)

    await waitUntil(() => container.textContent?.includes("vps-one") === true)

    expect(container.querySelectorAll("tbody tr")).toHaveLength(1)
    expect(
      container.querySelectorAll("[aria-label='Actions on vps-one']")
    ).toHaveLength(0)
  })
})
