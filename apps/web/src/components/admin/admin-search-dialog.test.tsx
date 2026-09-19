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
import { AdminSearchDialog } from "@/components/admin/admin-search-dialog"
import { createConsoleUser, useSessionApiClient } from "@/testing/harness"
import { fill, press, render, waitUntil, withDashboard } from "@/testing/render"

const mounted: (() => void)[] = []

function dialog() {
  return withDashboard(
    <AdminSearchDialog onOpenChange={() => undefined} open />,
    { platformRole: "owner" }
  )
}

function searchField(): Element {
  const found = document.querySelector("[role=dialog] input")

  if (!found) {
    throw new Error("no search field")
  }

  return found
}

describe("AdminSearchDialog", () => {
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

    await createServer({
      organizationId: console.organization.id,
      name: "vps-marmotte",
    })
    await createConsoleUser({
      email: "marmotte@test.local",
      name: "Marmotte",
    })
  })

  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("asks nothing under two characters, then groups what it finds", async () => {
    const { unmount } = await render(dialog())

    mounted.push(unmount)

    await fill(searchField(), "m")

    expect(document.body.textContent).not.toContain("vps-marmotte")

    await fill(searchField(), "marmotte")
    await waitUntil(
      () => document.body.textContent?.includes("vps-marmotte") === true
    )

    expect(document.body.textContent).toContain("marmotte@test.local")
    expect(document.body.textContent).toContain("Server")
    expect(document.body.textContent).toContain("Account")
  })

  it("shows the account state the platform calculates on every account found", async () => {
    const { prisma } = await bootApiTestServer()

    await prisma.user.updateMany({
      where: { email: "marmotte@test.local" },
      data: { deactivatedAt: new Date() },
    })

    const { unmount } = await render(dialog())

    mounted.push(unmount)

    await fill(searchField(), "marmotte")
    await waitUntil(
      () => document.body.textContent?.includes("marmotte@test.local") === true
    )

    expect(document.body.textContent).toContain("Deactivated")
  })

  it("says when nothing matches", async () => {
    const { unmount } = await render(dialog())

    mounted.push(unmount)

    await fill(searchField(), "zzzzzz")
    await waitUntil(
      () => document.body.textContent?.includes("Nothing matches") === true
    )
  })

  it("walks the results with the arrows", async () => {
    const { unmount } = await render(dialog())

    mounted.push(unmount)

    await fill(searchField(), "marmotte")
    await waitUntil(
      () => document.body.textContent?.includes("vps-marmotte") === true
    )

    const hits = () => [...document.querySelectorAll("[role=dialog] li button")]

    expect(hits().length).toBeGreaterThan(1)
    expect(hits()[0].className).toContain("bg-raised")

    await press(searchField(), "ArrowDown")

    expect(hits()[1].className).toContain("bg-raised")

    await press(searchField(), "ArrowUp")

    expect(hits()[0].className).toContain("bg-raised")
  })
})
