import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test"
import { bootApiTestServer, resetDb } from "@pupitre/api/testing"
import { StartPanel } from "@/components/dashboard/start-panel"
import type { DashboardOrganization } from "@/lib/domain/dashboard-context"
import { createConsoleUser, useSessionApiClient } from "@/testing/harness"
import { render, waitUntil, withDashboard } from "@/testing/render"

const mounted: (() => void)[] = []

describe("StartPanel", () => {
  let organization: DashboardOrganization

  beforeAll(async () => {
    await bootApiTestServer()
  })

  beforeEach(async () => {
    await resetDb()

    const console = await createConsoleUser({ email: "ada@test.local" })

    await useSessionApiClient(console.token)

    organization = {
      id: console.organization.id,
      name: console.organization.name,
      slug: console.organization.slug,
      state: "active",
    }
  })

  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount()
    }
  })

  it("names the three steps, the account behind, and goes straight to the app", async () => {
    const { container, unmount } = await render(
      withDashboard(<StartPanel />, { organization })
    )

    mounted.push(unmount)

    await waitUntil(
      () => container.textContent?.includes("Create your account") === true
    )

    const text = container.textContent ?? ""

    expect(text).toContain("Three steps, and your server works for you.")
    expect(text).toContain("Install the app and link it to your account")
    expect(text).toContain("Rent a server and add it")
    expect(text).toContain("Done")
    expect(text).not.toContain("trial")
    expect(text).not.toContain("card")

    const links = [...container.querySelectorAll("a")].map((link) =>
      link.getAttribute("href")
    )

    expect(links).toContain("/dashboard/download")
  })

  it("asks for an organisation before anything else", async () => {
    const { container, unmount } = await render(withDashboard(<StartPanel />))

    mounted.push(unmount)

    expect(container.textContent).toContain("No active organisation")
    expect(container.textContent).not.toContain("Create your account")
  })
})
